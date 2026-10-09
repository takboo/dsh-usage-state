import { createHash } from 'node:crypto'

import type { SnapshotError, UsageReading, UsageSnapshot } from '../shared/types.ts'
import type { UsageSource } from './sources/types.ts'
import { SourceError } from './sources/types.ts'
import type { UsageTarget } from './targets.ts'

/** Injectable time source: keeps the scheduler testable without real timers. */
export interface RefreshClock {
  now(): number
  /** Run `fn` once after `ms`; returns a cancel function. */
  after(ms: number, fn: () => void): () => void
  /** Run `fn` every `ms`; returns a cancel function. */
  every(ms: number, fn: () => void): () => void
}

export interface RefreshPolicy {
  intervalMinutes: number
  turnEndDelayMs: number
  minIntervalSeconds: number
}

export interface ResolvedTargetCredential {
  apiKey: string
  ref: string
  origin: string
  /** Endpoint override (plugin setting, or the endpoint the provider declares). */
  baseUrl?: string
  /** True when that endpoint was the user's explicit choice. */
  baseUrlPinned?: boolean
}

export interface UsageStateStoreDeps {
  clock: RefreshClock
  /** Read live from settings on every use, so config edits apply without a restart. */
  policy(): RefreshPolicy
  /** The current set of readings to keep fresh, in display order. */
  targets(): UsageTarget[]
  findSource(id: string): UsageSource | undefined
  credentials: {
    resolve(target: UsageTarget): Promise<ResolvedTargetCredential | undefined>
  }
  /** Perform the HTTP request and parse the payload. */
  read(target: UsageTarget, credentials: ResolvedTargetCredential, source: UsageSource): Promise<UsageReading>
}

function toSnapshotError(error: unknown, secret?: string): SnapshotError {
  const kind = error instanceof SourceError ? error.kind : 'unknown'
  if (!(error instanceof Error)) return { kind }
  const message = secret === undefined || secret === '' ? error.message : error.message.replaceAll(secret, '[redacted]')
  return message === '' ? { kind } : { kind, detail: message }
}

function targetSignature(target: UsageTarget | undefined): string {
  return JSON.stringify(target === undefined ? null : [
    target.key, target.sourceId, target.mode, target.baseUrl, target.baseUrlPinned === true, target.apiKeyRef, target.preferredRefs,
  ])
}

/**
 * Holds the last known reading of every configured source and decides when to
 * refresh it.
 *
 * The rules that matter for a plugin polling somebody else's billing endpoint:
 * a reading that succeeded is reused until the minimum interval has passed; a
 * failed attempt is never throttled (a retry may follow immediately); concurrent
 * callers share one in-flight request; and a failure never replaces a good
 * reading — it only marks it stale, so the status line can never show invented
 * numbers.
 */
export class UsageStateStore {
  // Note: plain field assignment rather than a constructor parameter property —
  // tests run through Node's strip-only TypeScript support, which rejects those.
  private readonly deps: UsageStateStoreDeps
  private readonly readings = new Map<string, UsageSnapshot>()
  private readonly succeededAt = new Map<string, number>()
  private readonly identities = new Map<string, string>()
  private readonly generations = new Map<string, number>()
  private readonly targetSignatures = new Map<string, string>()
  private readonly inflight = new Map<string, Promise<UsageSnapshot>>()
  private turnEndCancel: (() => void) | undefined
  private idleCancel: (() => void) | undefined
  private idleIntervalMs: number | undefined
  private stopped = false

  constructor(deps: UsageStateStoreDeps) {
    this.deps = deps
  }

  private invalidate(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1)
    this.identities.delete(key)
    this.readings.delete(key)
    this.succeededAt.delete(key)
    this.inflight.delete(key)
  }

  private currentTargets(): UsageTarget[] {
    const targets = this.deps.targets().map(target => ({ ...target }))
    const active = new Set(targets.map(target => target.key))
    for (const key of this.targetSignatures.keys()) {
      if (active.has(key)) continue
      this.invalidate(key)
      this.targetSignatures.delete(key)
    }
    for (const target of targets) {
      const signature = targetSignature(target)
      const previous = this.targetSignatures.get(target.key)
      if (previous !== undefined && previous !== signature) this.invalidate(target.key)
      this.targetSignatures.set(target.key, signature)
    }
    return targets
  }

  /** Everything known so far, keyed by target key. */
  snapshots(): Record<string, UsageSnapshot> {
    if (this.stopped) return {}
    this.currentTargets()
    const result: Record<string, UsageSnapshot> = {}
    for (const [key, snapshot] of this.readings) result[key] = snapshot
    return result
  }

  snapshot(key: string): UsageSnapshot | undefined {
    if (this.stopped) return undefined
    this.currentTargets()
    return this.readings.get(key)
  }

  /** Refresh every configured target; failures are captured, never thrown. */
  async refreshAll(): Promise<void> {
    if (this.stopped) return
    await Promise.all(this.deps.targets().map(target => this.refresh(target.key)))
  }

  /**
   * Refresh one target. Returns the cached snapshot when the minimum interval has
   * not elapsed yet, unless `force` is set.
   */
  async refresh(key: string, options: { force?: boolean; onlyIfMissing?: boolean } = {}): Promise<UsageSnapshot> {
    if (this.stopped) return {
      sourceId: key.split(':')[0] ?? '', mode: key.endsWith(':coding-plan') ? 'coding-plan' : 'api',
      balances: [], windows: [], fetchedAt: this.deps.clock.now(),
      error: { kind: 'config', detail: 'refresh stopped' },
    }
    const target = this.currentTargets().find(candidate => candidate.key === key)
    if (target === undefined) {
      return {
        sourceId: key.split(':')[0] ?? '',
        mode: key.endsWith(':coding-plan') ? 'coding-plan' : 'api',
        balances: [], windows: [], fetchedAt: this.deps.clock.now(),
        error: { kind: 'config', detail: `unknown target ${key}` },
      }
    }

    const signature = targetSignature(target)
    const generationAtLookup = this.generations.get(key) ?? 0
    const source = this.deps.findSource(target.sourceId)
    if (source === undefined) {
      return this.fail(target, { kind: 'config', detail: `unknown source ${target.sourceId}` }, this.readings.get(key))
    }
    let credential: ResolvedTargetCredential | undefined
    try {
      credential = await this.deps.credentials.resolve(target)
    } catch (error) {
      if (this.stopped) return this.refresh(key, options)
      const current = this.currentTargets().find(candidate => candidate.key === key)
      if (signature !== targetSignature(current) || (this.generations.get(key) ?? 0) !== generationAtLookup) {
        return this.refresh(key, options)
      }
      return this.fail(target, toSnapshotError(error), this.readings.get(key))
    }
    if (this.stopped) return this.refresh(key, options)
    const current = this.currentTargets().find(candidate => candidate.key === key)
    if (signature !== targetSignature(current)) return this.refresh(key, options)
    const identity = createHash('sha256').update(JSON.stringify([
      target.sourceId, target.mode,
      credential?.baseUrl ?? target.baseUrl ?? source.defaultBaseUrl(target.mode),
      credential?.baseUrlPinned === true || target.baseUrlPinned === true,
      credential?.ref ?? target.apiKeyRef, credential?.apiKey,
    ])).digest('hex')
    if ((this.generations.get(key) ?? 0) !== generationAtLookup &&
      this.identities.get(key) !== identity) {
      return this.refresh(key, options)
    }
    if (this.identities.get(key) !== identity) {
      this.identities.set(key, identity)
      this.generations.set(key, (this.generations.get(key) ?? 0) + 1)
      this.readings.delete(key)
      this.succeededAt.delete(key)
      this.inflight.delete(key)
    }
    if (credential === undefined) {
      return this.fail(target, { kind: 'config', detail: 'no credential configured' }, this.readings.get(key))
    }

    const cached = this.readings.get(key)
    const lastSuccess = this.succeededAt.get(key)
    if (
      options.force !== true &&
      cached !== undefined &&
      (options.onlyIfMissing === true || (
        cached.error === undefined &&
        lastSuccess !== undefined &&
        this.deps.clock.now() - lastSuccess < this.deps.policy().minIntervalSeconds * 1000
      ))
    ) {
      return cached
    }

    const running = this.inflight.get(key)
    if (running !== undefined) return running

    const generation = this.generations.get(key) ?? 0
    const promise = this.run(target, credential, source, generation).finally(() => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key)
    })
    this.inflight.set(key, promise)
    return promise
  }

  private async run(
    target: UsageTarget,
    credential: ResolvedTargetCredential,
    source: UsageSource,
    generation: number,
  ): Promise<UsageSnapshot> {
    const previous = this.readings.get(target.key)
    try {
      const reading = await this.deps.read(target, credential, source)
      if (this.generations.get(target.key) !== generation) return this.refresh(target.key)
      const fetchedAt = this.deps.clock.now()
      const snapshot: UsageSnapshot = {
        sourceId: target.sourceId,
        mode: target.mode,
        balances: reading.balances,
        windows: reading.windows,
        fetchedAt,
      }
      this.readings.set(target.key, snapshot)
      this.succeededAt.set(target.key, fetchedAt)
      return snapshot
    } catch (error) {
      if (this.generations.get(target.key) !== generation) return this.refresh(target.key)
      return this.fail(target, toSnapshotError(error, credential.apiKey), previous)
    }
  }

  private fail(target: UsageTarget, error: SnapshotError, previous: UsageSnapshot | undefined): UsageSnapshot {
    const snapshot: UsageSnapshot =
      previous === undefined
        ? {
            sourceId: target.sourceId,
            mode: target.mode,
            balances: [],
            windows: [],
            fetchedAt: this.deps.clock.now(),
            error,
          }
        : { ...previous, stale: true, error }
    this.readings.set(target.key, snapshot)
    return snapshot
  }

  /**
   * A turn just finished: refresh shortly, so the provider has time to settle the
   * request we just paid for. Repeated calls within the window collapse into one.
   */
  onTurnEnd(): void {
    if (this.turnEndCancel !== undefined) return
    const cancel = this.deps.clock.after(this.deps.policy().turnEndDelayMs, () => {
      this.turnEndCancel = undefined
      void this.refreshAll()
    })
    this.turnEndCancel = cancel
  }

  /** Apply a live policy edit without leaving the previous idle timer running. */
  reconfigure(): void {
    if (this.stopped) return
    this.currentTargets()
    if (this.idleCancel === undefined) return
    if (this.idleIntervalMs === this.deps.policy().intervalMinutes * 60_000) return
    this.idleCancel()
    this.idleCancel = undefined
    this.start()
  }

  /** Start the idle fallback timer; returns a stop function. */
  start(): () => void {
    this.stopped = false
    if (this.idleCancel === undefined) {
      const intervalMs = this.deps.policy().intervalMinutes * 60_000
      this.idleIntervalMs = intervalMs
      this.idleCancel = this.deps.clock.every(intervalMs, () => {
        void this.refreshAll()
      })
    }
    return () => this.stop()
  }

  stop(): void {
    this.stopped = true
    for (const key of this.targetSignatures.keys()) this.invalidate(key)
    this.turnEndCancel?.()
    this.turnEndCancel = undefined
    this.idleCancel?.()
    this.idleCancel = undefined
  }
}

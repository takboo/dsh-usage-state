import type { CredentialDescription } from './credentials.ts'
import type { UsageTarget } from './targets.ts'
import type { SourceCatalog } from '../shared/display.ts'
import type { UsageSnapshot } from '../shared/types.ts'
import type { CredentialReport, UsageStateView } from '../shared/rpc.ts'

export type { CredentialReport, UsageStateView } from '../shared/rpc.ts'

/** Cordis service key the RPC gateway resolves. */
export const USAGE_STATE_SERVICE = 'usageState'
/** RPC namespace; the wire endpoint is `<namespace>/<method>`. */
export const USAGE_STATE_RPC_NAMESPACE = 'usageState'

export interface UsageStateStoreLike {
  refresh(key: string, options?: { force?: boolean; onlyIfMissing?: boolean }): Promise<UsageSnapshot>
  snapshots(): Record<string, UsageSnapshot>
}

export interface UsageStateServiceDeps {
  store: UsageStateStoreLike
  targets(): UsageTarget[]
  catalog(): SourceCatalog
  endpointHints?(): Record<string, string>
  describe(target: UsageTarget): Promise<CredentialDescription>
  now(): number
}

/**
 * The browser-facing face of the plugin. Tiny on purpose: one poll method and one
 * credential-status method. Configuration is *not* here — the settings namespace
 * already carries it to the browser over the platform's own transport.
 */
export class UsageStateService {
  private readonly deps: UsageStateServiceDeps

  constructor(deps: UsageStateServiceDeps) {
    this.deps = deps
  }

  /**
   * Initialize a missing account identity, otherwise report cached readings.
   * The host owns periodic/turn refreshes; polling this method cannot shorten
   * that cadence. Forcing is reserved for an explicit refresh.
   *
   * Settled rather than all: one unreachable provider must not blank the whole
   * status line for the others.
   */
  async getState(force?: boolean): Promise<UsageStateView> {
    const options = force === true ? { force: true } : { onlyIfMissing: true }
    await Promise.allSettled(this.deps.targets().map(target => this.deps.store.refresh(target.key, options)))

    return {
      sources: this.deps.catalog(),
      snapshots: this.deps.store.snapshots(),
      ...(this.deps.endpointHints === undefined ? {} : { endpointHints: this.deps.endpointHints() }),
      checkedAt: this.deps.now(),
    }
  }

  /** Credential status per target key, never a secret value. */
  async describeCredentials(): Promise<CredentialReport> {
    const credentials: Record<string, CredentialDescription> = {}
    for (const target of this.deps.targets()) {
      credentials[target.key] = await this.deps.describe(target)
    }
    return { credentials }
  }
}

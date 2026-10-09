import type { DisplayConfig, ModelMode, UsageStateConfig } from './config.ts'
import type { BalanceAmount, SnapshotError, UsageMode, UsageSnapshot } from './types.ts'

/**
 * Plain description of a data source, produced host-side and shipped to the
 * browser. The browser half must not import host adapters (that would drag Node
 * builtins into the client bundle), so everything it needs about a source —
 * which modes exist, whether an endpoint is required, which credential refs are
 * probed — travels as data.
 */
export interface SourceCatalogEntry {
  id: string
  displayName: string
  modes: UsageMode[]
  requiresBaseUrl: boolean
  defaultBaseUrl: Partial<Record<UsageMode, string>>
  credentialRefs: Partial<Record<UsageMode, string[]>>
}

export type SourceCatalog = SourceCatalogEntry[]

/**
 * What the plugin can say about the provider behind the session's current model.
 * `needs-endpoint` is distinct because the user can act on it directly.
 */
export type ModelStatus =
  | { kind: 'hidden' }
  /**
   * The source catalog has not arrived (or the RPC that carries it failed), so no
   * provider can be resolved yet. Distinct from `unsupported`: claiming a mode is
   * unsupported when the plugin has simply heard nothing from its own host would be
   * a lie the user cannot act on.
   */
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'needs-endpoint' }
  | { kind: 'unsupported' }
  | { kind: 'ready'; key: string; sourceId: string; mode: UsageMode }

export type Severity = 'normal' | 'warn' | 'critical'

export type StatusSegment =
  | {
      kind: 'label'
      text: string
      stale?: boolean
      /** Epoch ms of the last successful reading, including a valid zero. */
      staleSince?: number
      errorKind?: SnapshotError['kind']
      errorDetail?: string
    }
  | { kind: 'balance'; amount: string; currency: string; granted?: number; toppedUp?: number }
  | {
      kind: 'window'
      windowId: string
      percent: string
      severity: Severity
      resetsAt?: number
      /**
       * Used percentage, 0..100, for the progress ring. A number rather than a drawn
       * string on purpose: the ring is an SVG (see `StatusLine`), so its width cannot
       * depend on which font ends up serving block/shade glyphs.
       */
      progress?: number
    }
  | {
      kind: 'state'
      state: 'loading' | 'unconfigured' | 'unsupported' | 'needs-endpoint' | 'error'
      errorKind?: SnapshotError['kind']
      /** Raw provider/network text, for the tooltip — the label stays localized. */
      errorDetail?: string
    }

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$' }


/** `¥66.28`, `$6.80`, `EUR 1.50`; an unknown code keeps its numeric form. */
export function formatBalance(balance: BalanceAmount): string {
  const amount = balance.amount.toFixed(2)
  const currency = balance.currency.trim().toUpperCase()
  if (currency === '') return amount
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol === undefined ? `${currency} ${amount}` : `${symbol}${amount}`
}

/** One decimal only when it carries information: `42%`, `42.5%`. */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

/** Compact, language-neutral age of a kept reading: `45s`, `12m`, `4h12m`, `3d`. */
export function formatAge(since: number, now: number): string {
  // formatCountdown subtracts its second argument from its first, so an age is
  // "now minus then" — passing them the other way round would always read 0s.
  return formatCountdown(now, since) ?? '0s'
}

/** Compact, language-neutral remaining time: `5d`, `3d4h`, `4h12m`, `12m`, `45s`. */
export function formatCountdown(resetsAt: number | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const seconds = Math.floor(Math.max(0, resetsAt - now) / 1000)

  const days = Math.floor(seconds / 86_400)
  if (days >= 1) {
    const hours = Math.floor((seconds % 86_400) / 3600)
    return hours === 0 ? `${days}d` : `${days}d${hours}h`
  }
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours}h${Math.floor((seconds % 3600) / 60)}m`
  const minutes = Math.floor(seconds / 60)
  return minutes >= 1 ? `${minutes}m` : `${seconds}s`
}

export function severityOf(usedPercent: number, display: DisplayConfig): Severity {
  if (usedPercent >= display.thresholdCriticalPercent) return 'critical'
  if (usedPercent >= display.thresholdWarnPercent) return 'warn'
  return 'normal'
}

export interface StatusInput {
  sourceLabel: string
  status: ModelStatus
  snapshot: UsageSnapshot | undefined
  display: DisplayConfig
  now: number
}

/**
 * The status line's content, as data: numbers formatted, states named, nothing
 * localized. The browser turns `state` and window ids into copy.
 *
 * A stale reading stays visible (with the label flagged) because hiding it would
 * look like "no usage"; a failure with no previous reading shows the error state
 * instead of a misleading zero.
 */
export function describeStatus(input: StatusInput): StatusSegment[] {
  const { status, snapshot, display, now } = input
  if (status.kind === 'hidden') return []
  if (status.kind === 'loading') return [{ kind: 'state', state: 'loading' }]
  if (status.kind === 'unconfigured') return [{ kind: 'state', state: 'unconfigured' }]
  if (status.kind === 'needs-endpoint') return [{ kind: 'state', state: 'needs-endpoint' }]
  if (status.kind === 'unsupported') return [{ kind: 'state', state: 'unsupported' }]

  const label: StatusSegment =
    snapshot?.stale === true
      ? {
          kind: 'label',
          text: input.sourceLabel,
          stale: true,
          // "kept the last good value" is only actionable if the user can see how
          // old it is (design: stale marker = time + ⚠).
          staleSince: snapshot.fetchedAt,
          ...(snapshot.error === undefined ? {} : { errorKind: snapshot.error.kind }),
          ...(snapshot.error?.detail === undefined ? {} : { errorDetail: snapshot.error.detail }),
        }
      : { kind: 'label', text: input.sourceLabel }

  if (snapshot === undefined) return [label, { kind: 'state', state: 'loading' }]

  if (snapshot.balances.length === 0 && snapshot.windows.length === 0) {
    return [
      label,
      snapshot.error === undefined
        ? { kind: 'state', state: 'loading' }
        : {
            kind: 'state',
            state: 'error',
            errorKind: snapshot.error.kind,
            ...(snapshot.error.detail === undefined ? {} : { errorDetail: snapshot.error.detail }),
          },
    ]
  }

  const segments: StatusSegment[] = [label]
  for (const balance of snapshot.balances) {
    segments.push({
      kind: 'balance',
      amount: formatBalance(balance),
      currency: balance.currency,
      ...(balance.granted === undefined ? {} : { granted: balance.granted }),
      ...(balance.toppedUp === undefined ? {} : { toppedUp: balance.toppedUp }),
    })
  }
  for (const window of snapshot.windows) {
    const segment: StatusSegment = {
      kind: 'window',
      windowId: window.id,
      percent: formatPercent(window.usedPercent),
      severity: severityOf(window.usedPercent, display),
    }
    // A reset instant already in the past means the window rolled over and the
    // provider will report fresh numbers on the next poll — showing "0s" is noise.
    if (window.resetsAt !== undefined && window.resetsAt > now) segment.resetsAt = window.resetsAt
    if (display.progressBar) segment.progress = Math.min(100, Math.max(0, window.usedPercent))
    segments.push(segment)
  }

  return segments
}

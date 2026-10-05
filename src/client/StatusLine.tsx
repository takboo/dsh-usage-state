import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

import { describeStatus, type ModelStatus, type Severity, type StatusSegment } from '../shared/display.ts'
import { resolveProvider } from '../shared/providers.ts'
import type { UsageStateConfig } from '../shared/config.ts'
import type { UsageStateSnapshotSource } from './status-source.ts'
import { statusParts, SEPARATOR, type StatusPart } from './status-text.ts'
import { useNow, useSettingsValue, useStoreState } from './hooks.ts'
import type { ModelSelectionProjectionLike, SettingsSource, Translate } from './context.ts'

export interface StatusLineProps {
  t: Translate
  usageState: UsageStateSnapshotSource
  settings: SettingsSource<{ value: UsageStateConfig | undefined }>
  useProjection?: <T>(key: string) => T | undefined
}

const BASE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  // `font: inherit` follows the platform's own composer chrome instead of guessing a
  // size, and keeps this line the same weight as the statistics beside the input.
  font: 'inherit',
  lineHeight: 'inherit',
  fontVariantNumeric: 'tabular-nums',
  // Segments stay whole: wrapping happens *between* them (see DOCK_STYLE).
  whiteSpace: 'nowrap' as const,
}

/**
 * The composer mount point: one full-width line in the composer stack, directly
 * above the input card.
 *
 * `conversation.input.dock` is a stretched column child (`.composerStack` is a column
 * flex with no `align-items`), so the width comes from the card's own custom
 * property, exactly like the platform's queued-message dock in that slot. It is
 * **not** the row below the card: `conversation.composer.dock` there is one centered
 * flex row shared with the platform's stats pill and the context meter, where a
 * contribution can only ever be a pill beside them (revisions 19 and 20).
 */
const DOCK_STYLE = {
  ...BASE_STYLE,
  // Wrapping is what keeps a long reading readable on a narrow window: without it the
  // line would either clip or push the platform's layout around.
  flexWrap: 'wrap' as const,
  rowGap: '2px',
  width: '100%',
  maxWidth: 'var(--dsh-composer-card-max-width)',
  margin: '0 auto',
  padding: '0 var(--dsh-composer-side-clearance)',
}

const LABEL_STYLE = { color: 'var(--dsw-alias-label-tertiary)' }
const SEPARATOR_STYLE = { color: 'var(--dsw-alias-separator-primary, var(--dsw-alias-label-dimmed))' }

/**
 * One segment and the separator that introduces it, boxed together.
 *
 * The line wraps between these boxes, never inside one: with the separator as a
 * sibling of the segments, a wrap ended a line on a dangling `·` while the segment it
 * introduces moved to the next line.
 */
const PART_STYLE = { display: 'inline-flex', alignItems: 'center', gap: '6px' }

/**
 * The mini bar, drawn with `█`/`░`.
 *
 * The shell's UI font has no coverage for block/shade glyphs, so a fallback serves
 * them at roughly **twice** the advance width: eight cells measured ~180px in a real
 * window and three of them wrapped the line. A monospace stack with a hair of
 * negative tracking keeps the same eight cells near 56px, and renders them as actual
 * blocks instead of diagonal hatch.
 */
const BAR_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.85em',
  letterSpacing: '-0.5px',
  marginLeft: '4px',
}

function severityColor(severity: Severity): string {
  if (severity === 'critical') return 'var(--dsw-alias-state-error-primary)'
  if (severity === 'warn') return 'var(--dsw-alias-state-warn-primary)'
  return 'var(--dsw-alias-label-secondary)'
}

/** Wrap one part in the platform tooltip when it has something more to say. */
function withTooltip(node: ReturnType<typeof renderPart>, tooltip: string | undefined, key: number) {
  if (tooltip === undefined) return node
  return (
    <Tooltip key={`tip-${key}`} label={tooltip} side="top">
      {node}
    </Tooltip>
  )
}

function renderPart(part: StatusPart, t: Translate, key: number) {
  switch (part.kind) {
    case 'label':
      return (
        <span key={key} style={LABEL_STYLE}>
          {part.stale ? '⚠ ' : ''}
          {part.text}
        </span>
      )
    case 'age':
      return (
        <span key={key} style={LABEL_STYLE}>
          {part.text}
        </span>
      )
    case 'balance':
      return (
        <span key={key} style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          {part.text}
        </span>
      )
    case 'window':
      return (
        <span key={key} style={{ color: severityColor(part.severity) }}>
          {part.text}
          {part.countdown === undefined ? '' : ` (${part.countdown})`}
          {part.bar === undefined ? '' : <span style={BAR_STYLE}>{part.bar}</span>}
        </span>
      )
    case 'state':
      return (
        <span key={key} style={LABEL_STYLE}>
          {part.text}
        </span>
      )
  }
}

/** Map a provider resolution onto what the line can say about it. */
function statusOf(resolution: ReturnType<typeof resolveProvider>, catalogEmpty: boolean): ModelStatus {
  switch (resolution.reason) {
    case 'hidden':
      return { kind: 'hidden' }
    case 'needs-endpoint':
      return { kind: 'needs-endpoint' }
    case 'unknown-source':
    case 'unsupported':
      // No source could be suggested at all, so this one is genuinely the user's to
      // configure.
      if (resolution.sourceId === null) return { kind: 'unconfigured' }
      // A suggested source the client cannot see yet is an unanswered RPC, not a
      // mode conflict: the catalog and the readings travel in the same answer, so
      // claiming "unsupported" here sends the user hunting for a configuration
      // problem that does not exist.
      if (catalogEmpty) return { kind: 'loading' }
      return { kind: 'unsupported' }
    case 'auto':
    case 'configured': {
      if (resolution.key === undefined || resolution.sourceId === null || resolution.mode === null) {
        return { kind: 'unconfigured' }
      }
      return { kind: 'ready', key: resolution.key, sourceId: resolution.sourceId, mode: resolution.mode }
    }
  }
}

/**
 * One read-only usage line: balance in API mode, 5h/7d quota in coding-plan mode.
 *
 * It reports the account's **current** reading, so it has exactly one home: the
 * line under the composer. There is no per-turn copy — an account-level number
 * cannot honestly describe a single turn (see `slots.ts`).
 */
export function StatusLine(props: StatusLineProps) {
  const t = props.t
  const now = useNow(30_000)
  const state = useStoreState(props.usageState)
  const settings = useSettingsValue(props.settings)
  const config = settings.value

  const selection = props.useProjection?.<ModelSelectionProjectionLike>('modelSelection')
  const current = selection?.next ?? selection?.lastUsed ?? null
  // No model in play yet (a brand-new session): say nothing rather than "not configured".
  if (config === undefined || current === null) return null

  const status: ModelStatus = statusOf(
    resolveProvider({ provider: current.provider, config, catalog: state.catalog }),
    state.catalog.length === 0,
  )
  const snapshot = status.kind === 'ready' ? state.snapshots[status.key] : undefined
  const sourceLabel =
    status.kind === 'ready'
      ? (state.catalog.find(entry => entry.id === status.sourceId)?.displayName ?? status.sourceId)
      : ''

  // A transport failure with no catalog is not a per-provider problem, so it never
  // reaches `describeStatus`: the line states the RPC failure itself.
  const segments: StatusSegment[] =
    state.catalog.length === 0 && state.status === 'error' && state.error !== undefined
      ? [{ kind: 'state', state: 'error', errorDetail: state.error }]
      : describeStatus({ sourceLabel, status, snapshot, display: config.display, now })

  const fullParts = statusParts({
    segments,
    t,
    now,
    ...(sourceLabel === '' ? {} : { sourceLabel }),
    ...(status.kind === 'ready'
      ? { modeLabel: status.mode === 'api' ? t('modeApi') : t('modeCodingPlan') }
      : {}),
  })
  if (fullParts.length === 0) return null

  return (
    <div data-usage-state="dock" style={DOCK_STYLE}>
      {fullParts.map((part, index) => (
        <span key={index} data-usage-part={index === 0 ? 'first' : 'following'} style={PART_STYLE}>
          {index > 0 ? (
            <span style={SEPARATOR_STYLE} aria-hidden="true">
              {SEPARATOR}
            </span>
          ) : null}
          {withTooltip(renderPart(part, t, index), part.tooltip, index)}
        </span>
      ))}
    </div>
  )
}

import { Fragment } from 'react'
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
  display: 'inline-flex',
  alignItems: 'center',
  // Contents start at the leading edge: any clipping this row does must eat the
  // tail, never the first segment (centered contents clip at both ends).
  justifyContent: 'flex-start',
  gap: '6px',
  // `font: inherit` is the platform's own `.pill` convention: the dock row is shared
  // with those pills, so inheriting its type keeps this line the same size as them
  // instead of one step smaller.
  font: 'inherit',
  lineHeight: 'inherit',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap' as const,
  // Shrinkable, but never wider than the dock: `minWidth: 0` is what allows a flex
  // item to shrink below its content width instead of overflowing the row.
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
}

/**
 * The composer mount point.
 *
 * DSH 0.2 renders `conversation.composer.dock` as a centered flex row that already
 * holds the platform's own stats pill (`id: "stats"`) and the context meter, so this
 * is **one item in that row**, not a row of its own. Claiming `width: 100%` here
 * squeezed every sibling down to its minimum width and, because this component also
 * centered its contents inside an `overflow: hidden` box, clipped its own first and
 * last segments at both ends. It now follows the platform's `.pill` convention:
 * content-sized, 999px radius, inherited typography.
 */
const DOCK_STYLE = {
  ...BASE_STYLE,
  maxWidth: '100%',
  padding: '1px 8px',
  borderRadius: '999px',
}

const LABEL_STYLE = { color: 'var(--dsw-alias-label-tertiary)' }
const SEPARATOR_STYLE = { color: 'var(--dsw-alias-separator-primary, var(--dsw-alias-label-dimmed))' }

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
          {part.bar === undefined ? '' : ` ${part.bar}`}
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
        <Fragment key={index}>
          {index > 0 ? (
            <span style={SEPARATOR_STYLE} aria-hidden="true">
              {SEPARATOR}
            </span>
          ) : null}
          {withTooltip(renderPart(part, t, index), part.tooltip, index)}
        </Fragment>
      ))}
    </div>
  )
}

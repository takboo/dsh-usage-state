import { useEffect, useRef, useState } from 'react'
import { Button, ControlStyles, Input, Switch, Tag } from './controls.tsx'

import { buildProviderRows, reorderProviders, type ProviderRow } from './provider-rows.ts'
import { useStoreState } from './hooks.ts'
import { useSettingsDraft } from './settings-draft.ts'
import type { UsageStateClientSource } from './status-source.ts'
import type { CredentialsRemoteLike, SettingsScopeLike, Translate } from './context.ts'
import type { CredentialCandidate, CredentialDescription } from '../shared/rpc.ts'
import { normalizeConfig, type ProviderMode, type UsageStateConfig } from '../shared/config.ts'
import type { SourceCatalog } from '../shared/display.ts'
import type { UsageMode } from '../shared/types.ts'
import { resolveProvider } from '../shared/providers.ts'

export interface SettingsSectionProps {
  t: Translate
  usageState: UsageStateClientSource
  settings: SettingsScopeLike<UsageStateConfig>
  credentials: CredentialsRemoteLike | undefined
}

const SECTION = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  minWidth: 0,
}

const ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap' as const,
  minWidth: 0,
}

const MUTED = { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px', overflowWrap: 'anywhere' as const }

/**
 * The card header is a two-column grid, never a wrapping flex row: the name
 * column absorbs the squeeze (and ellipsizes) so the controls keep the same
 * right edge on every card, whatever the provider is called.
 */
const HEADER = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
}

/** The name is already truncated by the time it is painted; the tooltip keeps it readable. */
const NAME = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
}

const CONTROLS = { display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }

/** Models are listed for orientation only, so the line stays short. */
const MAX_MODELS_SHOWN = 6

function modeLabel(mode: ProviderMode, t: Translate): string {
  if (mode === 'account') return t('modeAccount')
  if (mode === 'api') return t('modeApi')
  if (mode === 'coding-plan') return t('modeCodingPlan')
  if (mode === 'hidden') return t('modeHidden')
  return t('modeAuto')
}

function windowModeLabel(mode: UsageMode, t: Translate): string {
  return modeLabel(mode, t)
}

/** Keep partial input text while staging immediately; only the page Save writes. */
function DraftInput(props: {
  value: string
  label: string
  type?: string
  placeholder?: string
  disabled?: boolean
  width?: string
  resetKey: number
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(props.value)
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : props.value
  useEffect(() => { setEditing(false) }, [props.resetKey])

  return (
    <Input
      type={props.type ?? 'text'}
      aria-label={props.label}
      value={shown}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onChange={event => {
        if (props.disabled) return
        const value = (event.target as HTMLInputElement).value
        setEditing(true)
        setDraft(value)
        props.onCommit(value.trim())
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={event => {
        if ((event as { key?: string }).key === 'Enter') (event.target as HTMLInputElement).blur()
      }}
      style={{ width: props.width ?? '280px', maxWidth: '100%' }}
    />
  )
}

/**
 * Credential status and writes for one account. The candidate names are shown on
 * purpose: the user has to know what to call the environment variable or stored
 * credential — and when DSH already provides one, there is nothing to do here.
 */
function CredentialPanel(props: {
  t: Translate
  refs: readonly string[]
  refOverride?: string
  description: CredentialDescription | undefined
  credentials: CredentialsRemoteLike | undefined
  routeChanged: boolean
  onChanged: () => void
}) {
  const { t } = props
  const [draftForRef, setDraft] = useState<{ ref: string | undefined; value: string }>({ ref: undefined, value: '' })
  const [note, setNote] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const candidates = props.description?.candidates ?? []
  const configuredRef = props.refOverride ?? props.description?.ref ?? candidates.find(candidate => candidate.configured)?.ref ?? props.refs[0]
  const draft = draftForRef.ref === configuredRef ? draftForRef.value : ''
  const candidate = candidates.find(value => value.ref === configuredRef)
  const sameDescription = props.description?.ref === configuredRef
  const permission = candidate?.writable ?? (sameDescription ? props.description?.writable : undefined)
  const writable = permission === true
  const configured = candidate?.configured ?? (sameDescription && props.description?.configured === true)

  const save = async () => {
    if (busy.current || props.routeChanged || !writable || props.credentials === undefined || configuredRef === undefined || draft.trim() === '') return
    busy.current = true
    setPending(true)
    setNote(undefined)
    try {
      const result = await props.credentials.set(configuredRef, draft.trim())
      if (!result.ok) {
        setNote(t('credentialFailed', { message: result.error.message }))
        return
      }
      setDraft({ ref: configuredRef, value: '' })
      setNote(t('credentialSaved'))
      props.onChanged()
    } catch (error) {
      setNote(t('credentialFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const clear = async () => {
    if (busy.current || props.routeChanged || !writable || props.credentials === undefined || configuredRef === undefined) return
    busy.current = true
    setPending(true)
    setNote(undefined)
    try {
      const result = await props.credentials.unset(configuredRef)
      if (!result.ok) {
        setNote(t('credentialFailed', { message: result.error.message }))
        return
      }
      setNote(t('credentialSaved'))
      props.onChanged()
    } catch (error) {
      setNote(t('credentialFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={ROW}>
        <span style={MUTED}>{t('credential')}</span>
        {(candidates.length === 0
          ? props.refs.map((ref): CredentialCandidate => ({ ref, configured: false }))
          : candidates
        ).map(candidate => (
          <span key={candidate.ref} style={ROW}>
            <code style={{ fontSize: '11px' }}>{candidate.ref}</code>
            {candidate.configured ? (
              <Tag tone="success">{t('credentialConfigured', { source: candidate.source ?? '' })}</Tag>
            ) : (
              <Tag tone="neutral">{t('credentialMissing')}</Tag>
            )}
          </span>
        ))}
        {permission === false ? <span style={MUTED}>{t('credentialLocked')}</span> : permission === undefined ? <span style={MUTED}>{t('credentialChecking')}</span> : null}
      </div>
      <div style={ROW}>
        <Input
          type="password"
          autoComplete="off"
          value={draft}
          disabled={pending || props.routeChanged || !writable || props.credentials === undefined}
          placeholder={t('credentialPlaceholder')}
          aria-label={t('credential')}
          onChange={event => { if (!pending && !props.routeChanged && writable) setDraft({ ref: configuredRef, value: (event.target as HTMLInputElement).value }) }}
          style={{ maxWidth: '280px' }}
        />
        <Button size="sm" variant="primary" disabled={pending || props.routeChanged || !writable || props.credentials === undefined || configuredRef === undefined || draft.trim() === ''} onClick={() => void save()}>
          {t('credentialSave')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || props.routeChanged || !writable || props.credentials === undefined || configuredRef === undefined || !configured}
          onClick={() => void clear()}
        >
          {t('credentialClear')}
        </Button>
      </div>
      <span style={MUTED}>{props.routeChanged ? t('credentialSaveConfigFirst') : t('credentialHint')}</span>
      {note === undefined ? null : <span role="status" style={MUTED}>{note}</span>}
    </div>
  )
}

/** What this row currently resolves to, in one short phrase. */
function resolutionLabel(row: ProviderRow, catalog: SourceCatalog, t: Translate): string {
  const { resolution } = row
  if (resolution.reason === 'hidden') return t('modeHidden')
  if (resolution.reason === 'needs-endpoint') return t('needsEndpoint')
  if (resolution.reason === 'unknown-source') return t('unknownSource')
  if (resolution.reason === 'capability-unavailable') return t('openaiUsageUnavailable')
  if (resolution.reason === 'unsupported' || resolution.mode === null || resolution.sourceId === null) {
    return t('modeUnsupported')
  }
  const sourceLabel = catalog.find(entry => entry.id === resolution.sourceId)?.displayName ?? resolution.sourceId
  const target = `${sourceLabel} · ${windowModeLabel(resolution.mode, t)}`
  return resolution.reason === 'auto' ? t('detectedAs', { target }) : t('showsAs', { target })
}

function ProviderCard(props: {
  t: Translate
  row: ProviderRow
  config: UsageStateConfig
  catalog: SourceCatalog
  credentials: CredentialsRemoteLike | undefined
  description: CredentialDescription | undefined
  /** Failure of the last reading for this account, if any. */
  failure: { kind: string; detail?: string } | undefined
  index: number
  total: number
  disabled: boolean
  resetKey: number
  credentialRouteChanged: boolean
  onMode: (mode: ProviderMode) => void
  onMove: (delta: number) => void
  onField: (path: string[], value: string) => void
  onClearField: (path: string[]) => void
  onCredentialChanged: () => void
}) {
  const { t, row } = props
  const entry = props.config.providers[row.provider]
  const resolvedSource =
    row.resolution.sourceId === null ? undefined : props.catalog.find(candidate => candidate.id === row.resolution.sourceId)
  // Even before a mode is pinned down (a self-hosted source still needs its
  // endpoint), the user has to know which credential name will be looked for, so
  // fall back to the source's first mode rather than showing nothing.
  const refMode = row.resolution.mode ?? resolvedSource?.modes[0]
  const refs: string[] = refMode === undefined ? [] : [...(resolvedSource?.credentialRefs[refMode] ?? [])]

  const accountMode = row.resolution.mode === 'account'
  const modelNames = row.models.map(model => model.name)
  const listed = modelNames.slice(0, MAX_MODELS_SHOWN).join(' · ')
  const suffix = modelNames.length > MAX_MODELS_SHOWN ? ', …' : ''

  return (
    <div data-usage-provider={row.provider} style={{ ...SECTION, gap: '4px', padding: '9px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
      <div style={HEADER}>
        <span style={NAME} title={row.providerName === row.provider ? row.providerName : `${row.providerName} · ${row.provider}`}>
          <strong>{row.providerName}</strong>
          {/* The id only disambiguates, so it is the part the ellipsis should eat. */}
          {row.providerName === row.provider ? null : <span style={MUTED}> {row.provider}</span>}
        </span>
        <span style={CONTROLS}>
          <Button size="sm" variant="ghost" aria-label={t('moveUp')} disabled={props.disabled || props.index === 0} onClick={() => props.onMove(-1)}>
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('moveDown')}
            disabled={props.disabled || props.index === props.total - 1}
            onClick={() => props.onMove(1)}
          >
            ↓
          </Button>
          <select
            className="dsh-usage-state-select"
            aria-label={t('modeSelectLabel', { provider: row.providerName })}
            disabled={props.disabled}
            value={row.selected}
            onChange={event => {
              const mode = event.target.value as ProviderMode
              if (!props.disabled && row.modes.includes(mode)) props.onMode(mode)
            }}
            style={{ width: 'min(34vw, 150px)' }}
          >
            {row.modes.includes(row.selected) ? null : <option value={row.selected} disabled>{modeLabel(row.selected, t)} — {t('modeUnsupported')}</option>}
            {row.modes.map(mode => <option key={mode} value={mode}>{modeLabel(mode, t)}</option>)}
          </select>
        </span>
      </div>

      <span style={MUTED}>
        {row.resolution.reason === 'capability-unavailable' ? t('state.capability-unavailable') : resolutionLabel(row, props.catalog, t)}
        {accountMode ? <> · {t(props.description?.configured ? 'accountConnected' : 'accountSignInRequired')}</> : null}
        {resolvedSource?.unavailable === undefined ? null : <> · <a href={resolvedSource.unavailable.billingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{t('openaiBilling')}</a></>}
      </span>
      {props.failure === undefined ? null : (
        <span style={MUTED}>
          ⚠ {t(accountMode && props.failure.kind === 'config' ? 'accountSignInRequired' : accountMode && props.failure.kind === 'auth' ? 'accountAuthFailed' : `error.${props.failure.kind}`)}
          {props.failure.detail === undefined ? '' : ` — ${props.failure.detail}`}
        </span>
      )}
      <details>
        <summary style={{ ...MUTED, cursor: 'pointer' }}>{t('advanced')} · {t('modelCount', { count: modelNames.length })}</summary>
        <div style={{ ...SECTION, padding: '8px 0 2px' }}>
          <span style={MUTED}>{modelNames.length === 0 ? t('noModels') : t('modelsPrefix', { list: `${listed}${suffix}` })}</span>
          {resolvedSource?.unavailable === undefined ? null : <>
            <span style={MUTED}>{t('openaiUsageUnavailable')}</span>
          </>}
          <div style={ROW}>
            <span style={MUTED}>{t('sourceLabel')}</span>
            <select
              className="dsh-usage-state-select"
              aria-label={t('sourceLabel')}
              disabled={props.disabled}
              value={entry?.sourceId ?? ''}
              onChange={event => {
                if (props.disabled) return
                const value = (event.target as HTMLSelectElement).value
                if (value === '') props.onClearField(['providers', row.provider, 'sourceId'])
                else props.onField(['providers', row.provider, 'sourceId'], value)
              }}
            >
              <option value="">{t('sourceAuto')}</option>
              {props.catalog.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.displayName}
                </option>
              ))}
            </select>
          </div>

          {accountMode ? <span style={MUTED}>{t('accountHint')}</span> : resolvedSource?.unavailable !== undefined ? null : (<>
            <div style={ROW}>
              <span style={MUTED}>{t('baseUrl')}</span>
              <DraftInput
                resetKey={props.resetKey}
                disabled={props.disabled}
                value={entry?.baseUrl ?? ''}
                label={t('baseUrl')}
                placeholder={
                  row.resolution.baseUrl ?? (row.resolution.mode === null
                    ? t('baseUrlPlaceholder')
                    : (resolvedSource?.defaultBaseUrl[row.resolution.mode] ?? t('baseUrlPlaceholder')))
                }
                width="320px"
                onCommit={value => {
                  if (value === '') props.onClearField(['providers', row.provider, 'baseUrl'])
                  else props.onField(['providers', row.provider, 'baseUrl'], value)
                }}
              />
              {row.resolution.baseUrl !== undefined && row.resolution.baseUrlPinned !== true ? (
                <span style={MUTED}>{t('baseUrlInherited', { baseUrl: row.resolution.baseUrl })}</span>
              ) : null}
              {resolvedSource?.requiresBaseUrl === true && row.resolution.baseUrl === undefined ? (
                <Tag tone="warning">{t('baseUrlRequired')}</Tag>
              ) : null}
            </div>

            <div style={ROW}>
              <span style={MUTED}>{t('apiKeyRef')}</span>
              <DraftInput
                resetKey={props.resetKey}
                disabled={props.disabled}
                value={entry?.apiKeyRef ?? ''}
                label={t('apiKeyRef')}
                width="220px"
                onCommit={value => {
                  if (value === '') props.onClearField(['providers', row.provider, 'apiKeyRef'])
                  else props.onField(['providers', row.provider, 'apiKeyRef'], value)
                }}
              />
              <span style={MUTED}>{t('apiKeyRefHint')}</span>
            </div>

            <CredentialPanel
              t={t}
              refs={refs}
              refOverride={row.resolution.apiKeyRef}
              description={props.description}
              credentials={props.credentials}
              routeChanged={props.credentialRouteChanged}
              onChanged={props.onCredentialChanged}
            />
          </>)}
        </div>
      </details>
    </div>
  )
}

/**
 * The plugin's settings page: one row per provider. The reading is account-level,
 * so per-model configuration was both long and redundant. Everything the plugin
 * can work out on its own — which source, which mode, which key — is left to
 * "auto"; only deviations are written to the settings document.
 */
export function SettingsSection(props: SettingsSectionProps) {
  const { t } = props
  const draft = useSettingsDraft(props.settings)
  const { snapshot, config } = draft
  const state = useStoreState(props.usageState)

  useEffect(() => {
    void props.usageState.refreshModels()
    void props.usageState.refreshCredentials()
  }, [props.usageState])

  if (snapshot.status === 'unavailable') {
    return <p style={MUTED}>{t('unavailable')}</p>
  }

  const accepted = normalizeConfig(snapshot.value ?? {})
  const disabled = draft.pending || !snapshot.writable || snapshot.status !== 'ready' || snapshot.revision === undefined
  const routing = (config: UsageStateConfig, provider: string) => {
    const entry = config.providers[provider]
    const target = resolveProvider({ provider, config, catalog: state.catalog, endpointHint: state.endpointHints?.[provider] })
    return JSON.stringify([entry?.mode ?? 'auto', entry?.sourceId, entry?.baseUrl, entry?.apiKeyRef,
      target.sourceId, target.mode, target.baseUrl, target.apiKeyRef])
  }
  const rows = buildProviderRows({
    models: state.models, config, catalog: state.catalog, registry: state.modelRegistry, endpointHints: state.endpointHints,
  })

  const write = (path: string[], value: unknown) => draft.stage([{ op: 'set', path, value }])
  const clear = (path: string[]) => draft.stage([{ op: 'unset', path }])

  return (
    <div className="dsh-usage-state-settings" style={{ ...SECTION, gap: '18px', width: '100%', maxWidth: '760px', fontSize: '13px' }}>
      <ControlStyles />
      <header style={{ ...SECTION, gap: '6px' }}>
        <div style={ROW}>
          <Button size="sm" variant="outline" onClick={() => void props.usageState.refresh(true)}>
            {t('refreshNow')}
          </Button>
          <span style={MUTED}>
            {state.checkedAt === undefined
              ? t('neverChecked')
              : t('lastChecked', { time: new Date(state.checkedAt).toLocaleTimeString() })}
          </span>
          {state.error === undefined ? null : <span style={MUTED}>{t('refreshFailed', { message: state.error })}</span>}
          {state.modelsError === undefined ? null : <span style={MUTED}>{state.modelsError}</span>}
          {state.credentialsError === undefined ? null : <span style={MUTED}>{t('credentialFailed', { message: state.credentialsError })}</span>}
        </div>
      </header>

      <section style={{ ...SECTION, gap: '2px' }}>
        <strong>{t('sectionProviders')}</strong>
        <span style={MUTED}>{t('sectionProvidersHint')}</span>
        {rows.length === 0 ? <span style={MUTED}>{t('empty')}</span> : null}
        {rows.map((row, index) => (
          <ProviderCard
            key={row.provider}
            t={t}
            row={row}
            config={config}
            catalog={state.catalog}
            credentials={props.credentials}
            description={row.resolution.key === undefined ? undefined : state.credentials[row.resolution.key]}
            failure={row.resolution.key === undefined ? undefined : state.snapshots[row.resolution.key]?.error}
            index={index}
            total={rows.length}
            disabled={disabled}
            resetKey={draft.resetKey}
            credentialRouteChanged={routing(config, row.provider) !== routing(accepted, row.provider)}
            onMode={mode => write(['providers', row.provider, 'mode'], mode)}
            onMove={delta => {
              const next = reorderProviders(rows.map(candidate => candidate.provider), row.provider, delta)
              if (next !== undefined) write(['order'], next)
            }}
            onField={(path, value) => write(path, value)}
            onClearField={path => clear(path)}
            onCredentialChanged={() => {
              props.usageState.invalidate()
              void props.usageState.refreshCredentials()
              void props.usageState.refresh(true)
            }}
          />
        ))}
      </section>

      <section style={SECTION}>
        <strong>{t('sectionDisplay')}</strong>
        <div style={ROW}>
          <span style={MUTED}>{t('thresholdWarn')}</span>
          <DraftInput
            type="number"
            resetKey={draft.resetKey}
            disabled={disabled}
            value={String(config.display.thresholdWarnPercent)}
            label={t('thresholdWarn')}
            width="90px"
            onCommit={value => write(['display', 'thresholdWarnPercent'], Number(value))}
          />
          <span style={MUTED}>{t('thresholdCritical')}</span>
          <DraftInput
            type="number"
            resetKey={draft.resetKey}
            disabled={disabled}
            value={String(config.display.thresholdCriticalPercent)}
            label={t('thresholdCritical')}
            width="90px"
            onCommit={value => write(['display', 'thresholdCriticalPercent'], Number(value))}
          />
        </div>
        <div style={ROW}>
          <span style={MUTED}>{t('intervalMinutes')}</span>
          <DraftInput
            type="number"
            resetKey={draft.resetKey}
            disabled={disabled}
            value={String(config.refresh.intervalMinutes)}
            label={t('intervalMinutes')}
            width="90px"
            onCommit={value => write(['refresh', 'intervalMinutes'], Number(value))}
          />
        </div>
        <Switch
          disabled={disabled}
          checked={config.display.progressBar}
          label={t('progressBar')}
          onChange={next => write(['display', 'progressBar'], next)}
        />
      </section>

      <footer style={{ ...SECTION, gap: '6px', borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '10px' }}>
        <div style={ROW}>
          <Button size="sm" variant="primary" disabled={disabled || !draft.dirty} onClick={() => void draft.save()}>
            {t(draft.pending ? 'settingsSaving' : 'settingsSave')}
          </Button>
          <Button size="sm" variant="ghost" disabled={draft.pending || !draft.dirty} onClick={draft.reset}>{t('settingsReset')}</Button>
          <span style={MUTED}>{t(!snapshot.writable ? 'settingsReadOnly' : draft.dirty ? 'settingsDirty' : 'settingsPristine')}</span>
        </div>
        {draft.stale ? <span role="status" style={MUTED}>{t('settingsStale')}</span> : null}
        {draft.error === undefined ? null : <span role="alert" style={{ ...MUTED, color: 'var(--dsw-alias-state-error-primary)' }}>{t('settingsFailed', { message: draft.error })}</span>}
      </footer>
    </div>
  )
}

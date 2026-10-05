import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SettingsSection } from '../../src/client/SettingsSection.tsx'
import { StatusLine } from '../../src/client/StatusLine.tsx'
import { en } from '../../src/client/locales.ts'
import { normalizeConfig, type ProviderConfigEntry, type UsageStateConfig } from '../../src/shared/config.ts'
import type { SourceCatalog } from '../../src/shared/display.ts'
import type { UsageSnapshot } from '../../src/shared/types.ts'
import type { CredentialsRemoteLike } from '../../src/client/context.ts'
import type { CredentialDescription } from '../../src/shared/rpc.ts'

/**
 * Server-side renders of the real components. Effects (polling, settings
 * subscriptions) do not run here — the markup reflects the initial snapshot,
 * which is exactly the code path that has to be right on first paint.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is replaced by a stub through
 * `tests/support/client-render-hook.mjs` (see `npm test`).
 */

const t = (key: string, params?: Record<string, unknown>): string => {
  let text = (en as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

const CATALOG: SourceCatalog = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    modes: ['api'],
    requiresBaseUrl: false,
    defaultBaseUrl: { api: 'https://api.deepseek.com' },
    credentialRefs: { api: ['DEEPSEEK_API_KEY'] },
  },
  {
    id: 'zai',
    displayName: 'z.ai / GLM',
    modes: ['coding-plan'],
    requiresBaseUrl: false,
    defaultBaseUrl: { 'coding-plan': 'https://api.z.ai' },
    credentialRefs: { 'coding-plan': ['ZAI_API_KEY'] },
  },
  {
    id: 'sub2api',
    displayName: 'Sub2API',
    modes: ['api', 'coding-plan'],
    requiresBaseUrl: true,
    defaultBaseUrl: {},
    credentialRefs: { api: ['SUB2API_API_KEY'], 'coding-plan': ['SUB2API_API_KEY'] },
  },
]

function configWith(providers: Record<string, ProviderConfigEntry> = {}): UsageStateConfig {
  return normalizeConfig({ providers })
}

function storeWith(input: {
  catalog?: SourceCatalog
  snapshots?: Record<string, UsageSnapshot>
  credentials?: Record<string, CredentialDescription>
  models?: Array<{ provider: string; providerName: string; model: string; name: string }>
  registry?: { routable: readonly string[]; failed: readonly string[] }
  /** Transport state, for the cases where the plugin's own RPC never answered. */
  status?: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
}) {
  const state = {
    status: input.status ?? ('ready' as const),
    catalog: input.catalog ?? [],
    snapshots: input.snapshots ?? {},
    credentials: input.credentials ?? {},
    checkedAt: 1_000,
    models: input.models ?? [],
    modelRegistry: input.registry,
    error: input.error,
    credentialsError: undefined,
    modelsError: undefined,
  }
  const source = {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    refreshCredentials: async () => undefined,
    refreshModels: async () => undefined,
  }
  return source
}

/** The status line only needs the projection; the platform types it as a generic hook. */
const projectionOf = (selection: { provider: string; model: string } | undefined) =>
  ((_key: string) => (selection === undefined ? undefined : { next: selection, lastUsed: null })) as <T>(
    key: string,
  ) => T | undefined

function settingsWith(config: UsageStateConfig) {
  const snapshot = { status: 'ready' as const, value: config, revision: 1, writable: true, mode: 'host' as const }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    set: async () => undefined,
    unset: async () => undefined,
    mutate: async () => undefined,
  }
}

const CREDENTIALS: CredentialsRemoteLike = {
  describe: async () => ({ ok: true, value: {} }),
  set: async () => ({ ok: true, value: undefined }),
  unset: async () => ({ ok: true, value: undefined }),
}

test('the status line renders a balance for the session model', () => {
  const config = configWith({ 'deepseek-official': { mode: 'api' } })
  const store = storeWith({
    catalog: CATALOG,
    snapshots: {
      'deepseek:api': {
        sourceId: 'deepseek',
        mode: 'api',
        balances: [{ amount: 66.28, currency: 'CNY' }],
        windows: [],
        fetchedAt: 1_000,
      },
    },
  })

  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: store,
      settings: settingsWith(config),
      useProjection: projectionOf({ provider: 'deepseek-official', model: 'deepseek-flash' }),
    }),
  )

  assert.match(html, /data-usage-state="dock"/)
  assert.match(html, /DeepSeek/)
  assert.match(html, /¥66\.28/)
  // Hovering the line explains where the number comes from.
  assert.match(html, /data-tooltip="Source DeepSeek · Mode API balance"/)
})

test('the dock line is a full-width block of its own, aligned with the input card', () => {
  // `conversation.input.dock` is a stretched column child of `.composerStack`, so the
  // reading owns a line: it takes the card's width, centres itself in the stack, and
  // wraps between segments instead of clipping when the window is narrow. It must not
  // go back to being a pill in the row below the card (revisions 19/20).
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({
        catalog: CATALOG,
        snapshots: {
          'deepseek:api': {
            sourceId: 'deepseek',
            mode: 'api',
            balances: [{ amount: 66.28, currency: 'CNY' }],
            windows: [],
            fetchedAt: 1_000,
          },
        },
      }),
      settings: settingsWith(configWith({ 'deepseek-official': { mode: 'api' } })),
      useProjection: projectionOf({ provider: 'deepseek-official', model: 'deepseek-flash' }),
    }),
  )

  // Full width, capped and centred like the composer card it sits above.
  assert.match(html, /width:100%/)
  assert.match(html, /max-width:var\(--dsh-composer-card-max-width\)/)
  assert.match(html, /margin:0 auto/)
  // Segments stay whole and wrap between each other rather than being clipped.
  assert.match(html, /flex-wrap:wrap/)
  assert.doesNotMatch(html, /overflow:hidden/)
  assert.doesNotMatch(html, /border-radius:999px/)
})

test('a hidden or unselected model renders nothing at all', () => {
  const hidden = settingsWith(configWith({ p: { mode: 'hidden' } }))
  const props = {
    t,
    usageState: storeWith({ catalog: CATALOG }),
    settings: hidden,
    useProjection: projectionOf({ provider: 'p', model: 'm' }),
  }
  assert.equal(renderToStaticMarkup(h(StatusLine, props)), '')

  const noSelection = renderToStaticMarkup(h(StatusLine, { ...props, useProjection: projectionOf(undefined) }))
  assert.equal(noSelection, '')
})

test('a provider nobody can map says so instead of showing a number', () => {
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({ catalog: CATALOG }),
      settings: settingsWith(configWith()),
      useProjection: projectionOf({ provider: 'mystery', model: 'unconfigured' }),
    }),
  )

  assert.match(html, /Not configured/)
})

test('an unanswered RPC reads as loading rather than as an unsupported mode', () => {
  // The catalog and the readings arrive in one answer, so a mapped provider with no
  // catalog means "the plugin has not heard back", never "this source cannot serve
  // that mode" — the latter is what 0.4.0 displayed for a contribution that never
  // mounted, and it sent the reader looking for a configuration problem.
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({ status: 'loading' }),
      settings: settingsWith(configWith()),
      useProjection: projectionOf({ provider: 'zai-coding-cn', model: 'glm-5.3' }),
    }),
  )

  assert.match(html, /Reading/)
  assert.doesNotMatch(html, /Mode not supported/)
})

test('a failed RPC states the failure instead of blaming the provider', () => {
  // The line names the failure; the raw message rides the tooltip (and the settings
  // page prints it inline), which is this plugin's convention for detail.
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({ status: 'error', error: 'remote not mounted' }),
      settings: settingsWith(configWith()),
      useProjection: projectionOf({ provider: 'zai-coding-cn', model: 'glm-5.3' }),
    }),
  )

  assert.match(html, /Unavailable/)
  assert.doesNotMatch(html, /Mode not supported/)
  assert.doesNotMatch(html, /Reading/)
})

test('a self-hosted provider without an endpoint asks for one', () => {
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({ catalog: CATALOG }),
      settings: settingsWith(configWith()),
      useProjection: projectionOf({ provider: 'sub2api', model: 'gpt-5' }),
    }),
  )

  assert.match(html, /Needs an endpoint first/)
})

test('a stale reading stays visible and is marked', () => {
  const config = configWith({ 'deepseek-official': { mode: 'api' } })
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({
        catalog: CATALOG,
        snapshots: {
          'deepseek:api': {
            sourceId: 'deepseek',
            mode: 'api',
            balances: [{ amount: 12.5, currency: 'USD' }],
            windows: [],
            fetchedAt: Date.now() - 12 * 60_000,
            stale: true,
            error: { kind: 'network', detail: 'offline' },
          },
        },
      }),
      settings: settingsWith(config),
      useProjection: projectionOf({ provider: 'deepseek-official', model: 'deepseek-flash' }),
    }),
  )

  assert.match(html, /⚠/)
  assert.match(html, /showing the last value that was fetched successfully/i)
  assert.match(html, /12m ago/)
  assert.match(html, /\$12\.50/)
})

test('the settings page shows one row per provider with its models and resolved account', () => {
  const store = storeWith({
    catalog: CATALOG,
    models: [
      { provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-flash', name: 'DeepSeek V4 Flash' },
      { provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { provider: 'zai', providerName: 'z.ai / GLM', model: 'glm-4.6', name: 'GLM-4.6' },
    ],
    credentials: {
      'deepseek:api': {
        candidates: [{ ref: 'DEEPSEEK_API_KEY', configured: true, source: 'env', writable: true }],
        configured: true,
        ref: 'DEEPSEEK_API_KEY',
        source: 'env',
        writable: true,
      },
    },
  })

  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: store,
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /Usage state/)
  assert.match(html, /DeepSeek/)
  // Models are listed once per provider, not once per row of controls.
  assert.match(html, /Models: DeepSeek V4 Flash · DeepSeek V4 Pro/)
  assert.match(html, /Detected DeepSeek · API balance/)
  assert.match(html, /z\.ai \/ GLM/)
  assert.match(html, /Detected z\.ai \/ GLM · Coding plan/)
  // Auto is offered everywhere; only the source's own modes otherwise.
  assert.match(html, /Auto/)
  assert.match(html, /API balance/)
  assert.match(html, /Coding plan/)
  assert.match(html, /Hidden/)
  assert.match(html, /DEEPSEEK_API_KEY/)
  assert.match(html, /Configured \(env\)/)
  assert.match(html, /Advanced/)
})

test('a long provider name truncates instead of pushing the controls onto a second line', () => {
  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [
          {
            provider: 'opencode-go-deepseek',
            providerName: 'opencode-go-ds41',
            model: 'deepseek-v4-flash',
            name: 'DeepSeek V4.1 Flash',
          },
        ],
      }),
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )

  // The header is a two-column grid, so the controls cannot wrap below the name...
  assert.match(html, /grid-template-columns:minmax\(0, 1fr\) auto/)
  assert.match(html, /flex-shrink:0/)
  // ...and the name column ellipsizes rather than overflowing the card.
  assert.match(html, /overflow:hidden;text-overflow:ellipsis;white-space:nowrap/)
  // The full name pair survives in the tooltip, since the id is what gets cut.
  assert.match(html, /title="opencode-go-ds41 · opencode-go-deepseek"/)
})

test('the settings page shows why a reading failed, not just that it did', () => {
  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-flash', name: 'DeepSeek V4 Flash' }],
        snapshots: {
          'deepseek:api': {
            sourceId: 'deepseek',
            mode: 'api',
            balances: [],
            windows: [],
            fetchedAt: 1_000,
            error: { kind: 'config', detail: 'no credential configured' },
          },
        },
      }),
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /Missing key or endpoint/)
  assert.match(html, /no credential configured/)
})

test('the settings page demands an endpoint for a self-hosted provider', () => {
  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'sub2api', providerName: 'Sub2API', model: 'gpt-5', name: 'gpt-5' }],
      }),
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /Sub2API/)
  assert.match(html, /Needs an endpoint first/)
  assert.match(html, /This data source needs the endpoint of your own instance/)
  assert.match(html, /SUB2API_API_KEY/)
})

test('a hidden provider is marked as such instead of showing a target', () => {
  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'zai', providerName: 'z.ai / GLM', model: 'glm-4.6', name: 'GLM-4.6' }],
      }),
      settings: settingsWith(configWith({ zai: { mode: 'hidden' } })),
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /Hidden/)
  assert.doesNotMatch(html, /Detected/)
})

test('a provider deleted in DSH disappears from the settings page', () => {
  // The mode click persisted `opencode-go`; DSH no longer has the provider, so the
  // row must go even though the stored entry is still there.
  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-flash', name: 'DeepSeek V4 Flash' }],
        registry: { routable: ['deepseek-official'], failed: [] },
      }),
      settings: settingsWith(configWith({ 'opencode-go': { mode: 'coding-plan' } })),
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /DeepSeek/)
  assert.doesNotMatch(html, /opencode-go/)

  // Without a registry the row stays, so configuration is never hidden by a catalog
  // that simply has not loaded.
  const unknownRegistry = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-flash', name: 'DeepSeek V4 Flash' }],
      }),
      settings: settingsWith(configWith({ 'opencode-go': { mode: 'coding-plan' } })),
      credentials: CREDENTIALS,
    }),
  )
  assert.match(unknownRegistry, /opencode-go/)
})

test('the empty hint only shows when there is nothing to list at all', () => {
  const withProviders = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({
        catalog: CATALOG,
        models: [{ provider: 'deepseek-official', providerName: 'DeepSeek', model: 'deepseek-flash', name: 'DeepSeek V4 Flash' }],
      }),
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )
  assert.doesNotMatch(withProviders, /No providers found yet/)

  const withoutProviders = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({ catalog: CATALOG }),
      settings: settingsWith(configWith()),
      credentials: CREDENTIALS,
    }),
  )
  assert.match(withoutProviders, /No providers found yet/)
})

test('the settings page reports an unavailable settings transport instead of rendering controls', () => {
  const unavailable = {
    getSnapshot: () => ({ status: 'unavailable' as const, value: undefined, revision: undefined, writable: false, mode: 'memory' as const }),
    subscribe: () => () => undefined,
    set: async () => undefined,
    unset: async () => undefined,
    mutate: async () => undefined,
  }

  const html = renderToStaticMarkup(
    h(SettingsSection, {
      close: () => undefined,
      t,
      usageState: storeWith({}),
      settings: unavailable,
      credentials: CREDENTIALS,
    }),
  )

  assert.match(html, /does not serve settings/)
  assert.doesNotMatch(html, /API balance/)
})

test('the dock line matches the typography of the platform stats row', () => {
  // Above the card this element is a child of `.composerStack`, so `font: inherit`
  // picked up the *input card's* 14px and rendered a size larger than the platform's
  // own stats row under the card. That row (`StatsPills.module.css`) declares its size
  // explicitly, so the fix is to use the same expressions — identical by construction,
  // whatever the shell's variables resolve to.
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({
        catalog: CATALOG,
        snapshots: {
          'zai:coding-plan': {
            sourceId: 'zai',
            mode: 'coding-plan',
            balances: [],
            windows: [{ id: '5h', usedPercent: 10, resetsAt: 0 }],
            fetchedAt: 1_000,
          },
        },
      }),
      settings: settingsWith(configWith({ 'zai-coding-cn': { mode: 'coding-plan' } })),
      useProjection: projectionOf({ provider: 'zai-coding-cn', model: 'glm-5.3' }),
    }),
  )

  assert.match(html, /font-size:calc\(var\(--dsh-content-font-size-secondary, 13px\) - 1px\)/)
  assert.match(html, /line-height:calc\(20px \+ var\(--dsh-content-font-delta-secondary, 0px\)\)/)
  // Nothing may re-inherit the card's larger size.
  assert.doesNotMatch(html, /font:inherit/)
})

test('the mini bar cannot blow the line up through font fallback', () => {
  // `█`/`░` are not covered by the shell's UI font; served by a fallback they advance
  // at roughly twice the width, which is how three bars wrapped a real window. The bar
  // is therefore pinned to a monospace stack instead of inheriting the line's font.
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({
        catalog: CATALOG,
        snapshots: {
          'zai:coding-plan': {
            sourceId: 'zai',
            mode: 'coding-plan',
            balances: [],
            windows: [{ id: '5h', usedPercent: 10, resetsAt: 0 }],
            fetchedAt: 1_000,
          },
        },
      }),
      settings: settingsWith(configWith({ 'zai-coding-cn': { mode: 'coding-plan' } })),
      useProjection: projectionOf({ provider: 'zai-coding-cn', model: 'glm-5.3' }),
    }),
  )

  const bar = /<span style="font-family:ui-monospace[^"]*">[█░]+<\/span>/.exec(html)
  assert.notEqual(bar, null, 'the bar must render inside its own monospace span')
})

test('a separator is boxed with the segment it introduces, so a wrap cannot orphan it', () => {
  const html = renderToStaticMarkup(
    h(StatusLine, {
      t,
      usageState: storeWith({
        catalog: CATALOG,
        snapshots: {
          'zai:coding-plan': {
            sourceId: 'zai',
            mode: 'coding-plan',
            balances: [],
            windows: [
              { id: '5h', usedPercent: 10, resetsAt: 0 },
              { id: '7d', usedPercent: 4, resetsAt: 0 },
              { id: '30d', usedPercent: 10, resetsAt: 0 },
            ],
            fetchedAt: 1_000,
          },
        },
      }),
      settings: settingsWith(configWith({ 'zai-coding-cn': { mode: 'coding-plan' } })),
      useProjection: projectionOf({ provider: 'zai-coding-cn', model: 'glm-5.3' }),
    }),
  )

  const groups = html.split('data-usage-part=')
  // Label plus three windows.
  assert.equal(groups.length - 1, 4)
  // Every following group carries its own separator, and the first one does not.
  assert.doesNotMatch(groups[1] ?? '', />·</)
  for (const group of groups.slice(2)) assert.match(group.slice(0, 200), />·</)
})

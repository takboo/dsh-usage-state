import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, createUsageState, inject, name, type PluginContextLike, type UsageStateDeps } from '../../src/index.ts'
import type { FetchLike } from '../../src/host/read.ts'
import type { VolatileLike } from '../../src/host/settings.ts'

const BALANCE_BODY = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '66.28' }] }

interface Timer {
  at: number
  every: number | undefined
  fn: () => void
  cancelled: boolean
}

/** A cordis-shaped context that records what the plugin asks the host for. */
function contextStub(options: { settings?: Record<string, unknown>; credentials?: Record<string, string> } = {}) {
  const provided = new Map<string, unknown>()
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleanups: Array<() => void> = []
  const timers: Timer[] = []
  let now = 0

  // The loader hands the plugin a live reference to its own entry config; other
  // namespaces are read from the entry the config editor addresses.
  const stored = options.settings?.['usage-state'] ?? {}
  const config: VolatileLike<unknown> = { get: () => stored }

  const ctx = {
    get(name: string) {
      if (name === 'credentials') {
        return {
          resolve: async (ref: string) => {
            const value = options.credentials?.[ref]
            return value === undefined ? undefined : { value, source: 'store' }
          },
          describe: async (ref: string) => ({ configured: options.credentials?.[ref] !== undefined, writable: true }),
        }
      }
      if (name === 'configEditor') {
        return {
          entries: () =>
            Object.entries(options.settings ?? {}).map(([id, entryConfig]) => ({
              options: { id },
              fiber: { config: entryConfig },
            })),
        }
      }
      return undefined
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return () => undefined
    },
    effect(callback: () => (() => void) | void) {
      const cleanup = callback()
      if (cleanup !== undefined) cleanups.push(cleanup)
    },
    provide(key: string, value: unknown) {
      provided.set(key, value)
    },
    timeout(fn: () => void, delay: number) {
      const timer: Timer = { at: now + delay, every: undefined, fn, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    interval(fn: () => void, delay: number) {
      const timer: Timer = { at: now + delay, every: delay, fn, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  } as unknown as PluginContextLike

  return {
    ctx,
    /** The reference the loader would pass `apply` as its second argument. */
    config,
    provided,
    listeners,
    timers,
    dispose() { for (const cleanup of cleanups.toReversed()) cleanup() },
    /** The stub's clock source, so the plugin's timers and the store agree on "now". */
    time: () => now,
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) handler(...args)
    },
    async advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = timers
          .filter(timer => !timer.cancelled && timer.at <= target)
          .sort((a, b) => a.at - b.at)[0]
        if (due === undefined) break
        now = due.at
        if (due.every === undefined) due.cancelled = true
        else due.at += due.every
        due.fn()
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      now = target
    },
  }
}

/**
 * The deps one test needs: the entry config the loader would pass `apply`, plus the
 * seams (fetch, clock, credential fallback) it overrides.
 */
function deps(host: ReturnType<typeof contextStub>, extra: Partial<UsageStateDeps> = {}): UsageStateDeps {
  return { config: host.config, now: host.time, credentialFallback: false, ...extra }
}

const CONFIGURED = {
  'usage-state': {
    models: [{ provider: 'deepseek-official', model: 'deepseek-flash', sourceId: 'deepseek', mode: 'api' }],
  },
}

function fetchStub(): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    fetch: async url => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => BALANCE_BODY }
    },
  }
}

test('state exposes origin-only hints for providers recognized from their declared endpoint', async () => {
  const host = contextStub({
    settings: { 'llm-pi-ai': { providers: { 'custom-account': {
      baseURL: 'https://url-user:url-secret@api.deepseek.com/v1?key=url-token', apiKeyEnv: 'CUSTOM_KEY',
    } } } },
    credentials: { CUSTOM_KEY: 'custom-test-key' },
  })
  const get = host.ctx.get.bind(host.ctx)
  host.ctx.get = name => name === 'llm' ? { listProviders: () => [{ id: 'custom-account' }] } : get(name)
  const service = createUsageState(host.ctx, deps(host, { fetch: fetchStub().fetch }))

  const state = await service.getState(false)
  const wire = JSON.parse(JSON.stringify(state)) as Record<string, unknown>

  assert.deepEqual(wire.endpointHints, { 'custom-account': 'https://api.deepseek.com' })
  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 66.28, currency: 'CNY' }])
  for (const secret of ['url-secret', 'url-token', 'custom-test-key']) assert.equal(JSON.stringify(wire).includes(secret), false)
})

test('a malformed balance response keeps the last successful reading and exposes a parse failure', async () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  let malformed = false
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async () => ({ ok: true, status: 200, json: async () => malformed
      ? { balance_infos: [{ currency: 'CNY', total_balance: 'bad' }] }
      : BALANCE_BODY }),
  }))
  await service.getState(false)
  malformed = true
  const state = await service.getState(true)

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 66.28, currency: 'CNY' }])
  assert.equal(state.snapshots['deepseek:api']?.stale, true)
  assert.equal(state.snapshots['deepseek:api']?.error?.kind, 'parse')
})

test('rotating a credential at the same ref refreshes the effective account identity', async () => {
  const credentials = { DEEPSEEK_API_KEY: 'first-test-key' }
  const host = contextStub({ settings: CONFIGURED, credentials })
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async (_url, init) => ({ ok: true, status: 200, json: async () => ({ balance_infos: [{
      currency: 'CNY', total_balance: init.headers.authorization === 'Bearer first-test-key' ? '11' : '22',
    }] }) }),
  }))
  await service.getState(false)
  credentials.DEEPSEEK_API_KEY = 'second-test-key'
  const state = await service.getState(false)

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
  assert.equal(JSON.stringify(state).includes('second-test-key'), false)
})

test('a lookup started before an ABA configuration edit is resolved again before querying', async () => {
  const settings = { providers: { deepseek: { mode: 'api', apiKeyRef: 'FIRST_KEY' } } }
  const host = contextStub({ settings: { 'usage-state': settings } })
  const get = host.ctx.get.bind(host.ctx)
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  let lookups = 0
  host.ctx.get = name => name === 'credentials' ? {
    resolve: async () => {
      const first = ++lookups === 1
      if (first) await gate
      return { value: first ? 'old-test-key' : 'new-test-key', source: 'store' }
    },
    describe: async () => ({ configured: true, writable: true }),
  } : get(name)
  const service = createUsageState(host.ctx, deps(host, { fetch: async (_url, init) => ({
    ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY',
      total_balance: init.headers.authorization === 'Bearer old-test-key' ? '11' : '22' }] }),
  }) }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.apiKeyRef = 'SECOND_KEY'
  host.emit('loader/volatile-update')
  settings.providers.deepseek.apiKeyRef = 'FIRST_KEY'
  host.emit('loader/volatile-update')
  release?.()
  const state = await pending

  assert.equal(lookups, 2)
  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
})

test('changing the DSH-declared credential ref invalidates an in-flight account request', async () => {
  const declared = { apiKeyEnv: 'FIRST_KEY' }
  const host = contextStub({ settings: { ...CONFIGURED, 'llm-deepseek': declared },
    credentials: { FIRST_KEY: 'first-test-key', SECOND_KEY: 'second-test-key' } })
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const service = createUsageState(host.ctx, deps(host, { fetch: async (_url, init) => {
    const first = init.headers.authorization === 'Bearer first-test-key'
    if (first) await gate
    return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: first ? '11' : '22' }] }) }
  } }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  declared.apiKeyEnv = 'SECOND_KEY'
  host.emit('loader/volatile-update')
  release?.()
  const state = await pending

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
})

test('disposing the plugin prevents a superseded response from starting another account request', async () => {
  const settings = { providers: { deepseek: { mode: 'api', baseUrl: 'https://first.example' } } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const urls: string[] = []
  const service = createUsageState(host.ctx, deps(host, { fetch: async url => {
    urls.push(url)
    if (url.startsWith('https://first.example/')) await gate
    return { ok: true, status: 200, json: async () => BALANCE_BODY }
  } }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.baseUrl = 'https://second.example'
  host.emit('loader/volatile-update')
  host.dispose()
  release?.()
  const state = await pending

  assert.deepEqual(urls, ['https://first.example/user/balance'])
  assert.deepEqual(state.snapshots, {})
})

test('deleting the last live provider stops polling its retained configuration', async () => {
  let providers = ['deepseek-official']
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const get = host.ctx.get.bind(host.ctx)
  host.ctx.get = name => name === 'llm' ? { listProviders: () => providers.map(id => ({ id })) } : get(name)
  const { fetch, urls } = fetchStub()
  const service = createUsageState(host.ctx, deps(host, { fetch }))
  await service.getState(false)

  providers = []
  host.emit('loader/volatile-update')
  await host.advance(300_000)
  const state = await service.getState(false)

  assert.equal(urls.length, 1)
  assert.deepEqual(state.snapshots, {})
})

test('provider error details cannot echo the resolved key across RPC', async () => {
  const key = 'echoed-test-secret'
  const host = contextStub({ settings: { 'usage-state': { providers: { zai: { mode: 'coding-plan' } } } },
    credentials: { ZAI_API_KEY: key } })
  const service = createUsageState(host.ctx, deps(host, { fetch: async () => ({
    ok: true, status: 200, json: async () => ({ success: false, code: 1000, msg: `Rejected Authorization: Bearer ${key}` }),
  }) }))

  const state = await service.getState(false)

  assert.equal(state.snapshots['zai:coding-plan']?.error?.kind, 'auth')
  assert.equal(JSON.stringify(state).includes(key), false)
  assert.match(state.snapshots['zai:coding-plan']?.error?.detail ?? '', /Rejected Authorization/)
})

test('the plugin declares its cordis identity', () => {
  assert.equal(name, 'usage-state')
  assert.ok(inject.includes('timer'), 'the refresh timers come from the cordis timer plugin')
})

test('applying the plugin provides the service under the name the gateway resolves', () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch } = fetchStub()

  const service = createUsageState(host.ctx, deps(host, { fetch }))

  assert.equal(host.provided.get('usageState'), service)

  // Mirrors dsh-api-gateway's readBinding: `service` is the service OBJECT, and a
  // string there fails every dispatch with gateway/binding-invalid.
  const binding = (service as unknown as { typertRemote?: { service: unknown; serviceKey: string; namespace: string } })
    .typertRemote
  assert.equal(binding?.service, service)
  assert.equal(binding?.serviceKey, 'usageState')
  assert.equal(binding?.namespace, 'usageState')
  assert.equal(Object.keys(service).includes('typertRemote'), false, 'the binding is hidden from enumeration')
})

test('getState reads the configured model and returns its balance', async () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch, urls } = fetchStub()

  const service = createUsageState(host.ctx, deps(host, { fetch }))
  const state = await service.getState(false)

  assert.deepEqual(urls, ['https://api.deepseek.com/user/balance'])
  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 66.28, currency: 'CNY' }])
  assert.equal(state.sources.length, 5)
})

const OPENCODE_BODY = {
  usage: {
    rolling: { status: 'ok', percent: 12.5, resetsAt: '2026-09-21T10:08:43.658Z' },
    weekly: { status: 'ok', percent: 6, resetsAt: '2026-09-28T00:00:00.658Z' },
    monthly: { status: 'ok', percent: 2, resetsAt: '2026-10-21T03:42:07.658Z' },
  },
}

test('both OpenCode Go routes share one target, one request and one 5h/7d/30d reading', async () => {
  const host = contextStub({
    settings: { 'usage-state': { providers: { 'opencode-go': {}, 'opencode-go-deepseek': {} } } },
    credentials: { OPENCODE_GO_API_KEY: 'sk-go' },
  })
  const urls: string[] = []
  const fetch: FetchLike = async url => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => OPENCODE_BODY }
  }

  const service = createUsageState(host.ctx, deps(host, { fetch }))
  const state = await service.getState(false)

  assert.deepEqual(urls, ['https://opencode.ai/zen/go/v1/usage'])
  assert.deepEqual(state.snapshots['opencode:coding-plan']?.windows.map(window => window.id), ['5h', '7d', '30d'])
  assert.equal(state.snapshots['opencode:coding-plan']?.windows[0]?.usedPercent, 12.5)
})

test('a model nobody configured produces no poll target at all', async () => {
  const host = contextStub({ settings: {}, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch, urls } = fetchStub()

  const service = createUsageState(host.ctx, deps(host, { fetch }))
  const state = await service.getState(false)

  assert.deepEqual(urls, [])
  assert.deepEqual(state.snapshots, {})
})

test('a missing credential is reported as a configuration problem, not a fake balance', async () => {
  const host = contextStub({ settings: CONFIGURED })
  const { fetch, urls } = fetchStub()

  const service = createUsageState(host.ctx, deps(host, { fetch }))
  const state = await service.getState(false)

  assert.deepEqual(urls, [])
  assert.equal(state.snapshots['deepseek:api']?.error?.kind, 'config')
})

test('describeCredentials reports status for every configured target without a secret', async () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const service = createUsageState(host.ctx, deps(host, { fetch: fetchStub().fetch }))

  const report = await service.describeCredentials()

  assert.deepEqual(Object.keys(report.credentials), ['deepseek:api'])
  const description = report.credentials['deepseek:api']
  assert.equal(description?.configured, true)
  assert.equal(description?.ref, 'DEEPSEEK_API_KEY')
  assert.equal(JSON.stringify(report).includes('sk-test'), false)
})

test('the provider-configured apiKeyEnv is probed before the built-in ref', async () => {
  const host = contextStub({
    settings: { ...CONFIGURED, 'llm-deepseek': { apiKeyEnv: 'TEAM_KEY' } },
    credentials: { TEAM_KEY: 'sk-team', DEEPSEEK_API_KEY: 'sk-personal' },
  })
  const service = createUsageState(host.ctx, deps(host, { fetch: fetchStub().fetch }))

  const report = await service.describeCredentials()

  assert.equal(report.credentials['deepseek:api']?.ref, 'TEAM_KEY')
})

test('a finished turn schedules a refresh, and the idle timer keeps polling', async () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch, urls } = fetchStub()

  createUsageState(host.ctx, deps(host, { fetch }))

  host.emit('session/event', { id: 's1' }, { type: 'turn/end' })
  host.emit('session/event', { id: 's1' }, { type: 'tool/call' })
  assert.equal(urls.length, 0, 'the refresh waits for the provider to settle')

  await host.advance(2000)
  assert.equal(urls.length, 1)

  await host.advance(5 * 60_000)
  assert.equal(urls.length, 2, 'the idle timer keeps the reading fresh')
})

test('apply() takes the loader config reference as its second argument', () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })

  assert.doesNotThrow(() => {
    apply(host.ctx, host.config)
  })
  assert.ok(host.provided.get('usageState') !== undefined)
})

test('a provider that declares a base URL is polled at that host', async () => {
  const host = contextStub({
    settings: {
      'usage-state': { providers: { 'zai-coding': { mode: 'coding-plan' } } },
      // Exactly how a DSH provider profile declares its API base.
      'llm-pi-ai': { providers: { 'zai-coding': { apiKeyEnv: 'ZAI_KEY', baseURL: 'https://api.z.ai/api/paas/v4' } } },
    },
    credentials: { ZAI_KEY: 'sk-zai' },
  })
  const urls: string[] = []
  const fetch: FetchLike = async url => {
    urls.push(url)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          limits: [
            { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42 },
            { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 18 },
          ],
        },
      }),
    }
  }

  const service = createUsageState(host.ctx, deps(host, { fetch }))
  const state = await service.getState(false)

  assert.deepEqual(urls, ['https://api.z.ai/api/monitor/usage/quota/limit'])
  assert.deepEqual(state.snapshots['zai:coding-plan']?.windows.map(window => window.id), ['5h', '7d'])
})

test('a provider credential override selects the requested account for readings and descriptions', async () => {
  const host = contextStub({
    settings: { 'usage-state': { providers: { deepseek: { mode: 'api', apiKeyRef: 'TEAM_KEY' } } } },
    credentials: { TEAM_KEY: 'team-test-key', DEEPSEEK_API_KEY: 'default-test-key' },
  })
  const headers: string[] = []
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async (_url, init) => {
      headers.push(init.headers.authorization ?? '')
      return { ok: true, status: 200, json: async () => BALANCE_BODY }
    },
  }))

  await service.getState(false)
  const report = await service.describeCredentials()

  assert.deepEqual(headers, ['Bearer team-test-key'])
  assert.equal(report.credentials['deepseek:api']?.ref, 'TEAM_KEY')
  assert.equal(JSON.stringify(report).includes('team-test-key'), false)
})

test('pinning a provider endpoint does not send its key to a regional mirror', async () => {
  const host = contextStub({
    settings: { 'usage-state': { providers: { zai: { mode: 'coding-plan', baseUrl: 'https://api.z.ai' } } } },
    credentials: { ZAI_API_KEY: 'region-test-key' },
  })
  const urls: string[] = []
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async url => {
      urls.push(url)
      return { ok: false, status: 401, json: async () => ({}) }
    },
  }))

  const state = await service.getState(false)

  assert.deepEqual(urls, ['https://api.z.ai/api/monitor/usage/quota/limit'])
  assert.equal(state.snapshots['zai:coding-plan']?.error?.kind, 'auth')
})

test('explicit provider account settings win over legacy source defaults', async () => {
  const host = contextStub({
    settings: { 'usage-state': {
      providers: { deepseek: { mode: 'api', baseUrl: 'https://team.example', apiKeyRef: 'TEAM_KEY' } },
      sources: { deepseek: { baseUrl: 'https://legacy.example', apiKeyRef: 'LEGACY_KEY' } },
    } },
    credentials: { TEAM_KEY: 'team-test-key', LEGACY_KEY: 'legacy-test-key' },
  })
  const requests: Array<{ url: string; authorization: string | undefined }> = []
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async (url, init) => {
      requests.push({ url, authorization: init.headers.authorization })
      return { ok: true, status: 200, json: async () => BALANCE_BODY }
    },
  }))

  await service.getState(false)

  assert.deepEqual(requests, [{ url: 'https://team.example/user/balance', authorization: 'Bearer team-test-key' }])
})

test('changing the provider endpoint does not reuse the previous account reading', async () => {
  const settings = { providers: { deepseek: { mode: 'api', baseUrl: 'https://first.example' } } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'account-test-key' } })
  const urls: string[] = []
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async url => {
      urls.push(url)
      const total_balance = url.startsWith('https://first.example/') ? '11' : '22'
      return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance }] }) }
    },
  }))

  await service.getState(false)
  settings.providers.deepseek.baseUrl = 'https://second.example'
  host.emit('loader/volatile-update')
  const state = await service.getState(false)

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
  assert.deepEqual(urls, ['https://first.example/user/balance', 'https://second.example/user/balance'])
  assert.equal(JSON.stringify(state).includes('account-test-key'), false)
})

test('a late response from the previous endpoint cannot replace the new account reading', async () => {
  const settings = { providers: { deepseek: { mode: 'api', baseUrl: 'https://first.example' } } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'account-test-key' } })
  let release: (() => void) | undefined
  const firstResponse = new Promise<void>(resolve => { release = resolve })
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async url => {
      const first = url.startsWith('https://first.example/')
      if (first) await firstResponse
      return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: first ? '11' : '22' }] }) }
    },
  }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.baseUrl = 'https://second.example'
  host.emit('loader/volatile-update')
  await service.getState(true)
  release?.()
  const state = await pending

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
  assert.deepEqual((await service.getState(false)).snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
})

test('returning to an earlier endpoint still rejects its older in-flight response', async () => {
  const settings = { providers: { deepseek: { mode: 'api', baseUrl: 'https://first.example' } } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'account-test-key' } })
  let release: (() => void) | undefined
  const firstResponse = new Promise<void>(resolve => { release = resolve })
  let firstRequests = 0
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async url => {
      const first = url.startsWith('https://first.example/')
      let amount = '22'
      if (first) {
        firstRequests++
        amount = firstRequests === 1 ? '11' : '33'
        if (firstRequests === 1) await firstResponse
      }
      return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: amount }] }) }
    },
  }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.baseUrl = 'https://second.example'
  host.emit('loader/volatile-update')
  await service.getState(true)
  settings.providers.deepseek.baseUrl = 'https://first.example'
  host.emit('loader/volatile-update')
  await service.getState(true)
  release?.()
  const state = await pending

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 33, currency: 'CNY' }])
})

test('polling state preserves the host idle cadence while explicit refresh remains immediate', async () => {
  const host = contextStub({ settings: CONFIGURED, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch, urls } = fetchStub()
  const service = createUsageState(host.ctx, deps(host, { fetch }))

  await service.getState(false)
  await host.advance(60_000)
  await service.getState(false)
  assert.equal(urls.length, 1, 'a browser state poll does not become an idle API refresh')

  await host.advance(240_000)
  await service.getState(false)
  assert.equal(urls.length, 2, 'the host refreshes at the configured five-minute cadence')

  await service.getState(true)
  assert.equal(urls.length, 3, 'an explicit refresh can bypass the successful minimum interval')
})

test('editing the idle interval reschedules the running host timer', async () => {
  const settings = { ...CONFIGURED['usage-state'], refresh: { intervalMinutes: 5 } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'sk-test' } })
  const { fetch, urls } = fetchStub()
  const service = createUsageState(host.ctx, deps(host, { fetch }))
  await service.getState(false)

  settings.refresh.intervalMinutes = 1
  host.emit('loader/volatile-update')
  await host.advance(59_999)
  assert.equal(urls.length, 1)
  await host.advance(1)
  assert.equal(urls.length, 2, 'the new one-minute interval is effective without remounting')
})

test('a configuration edit invalidates an in-flight response before the next browser poll', async () => {
  const settings = { providers: { deepseek: { mode: 'api', baseUrl: 'https://first.example' } } }
  const host = contextStub({ settings: { 'usage-state': settings }, credentials: { DEEPSEEK_API_KEY: 'account-test-key' } })
  let release: (() => void) | undefined
  const firstResponse = new Promise<void>(resolve => { release = resolve })
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async url => {
      const first = url.startsWith('https://first.example/')
      if (first) await firstResponse
      return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: first ? '11' : '22' }] }) }
    },
  }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.baseUrl = 'https://second.example'
  host.emit('loader/volatile-update')
  release?.()
  const state = await pending

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
})

test('a delayed credential lookup cannot restore the previous provider configuration', async () => {
  const settings = { providers: { deepseek: { mode: 'api', apiKeyRef: 'FIRST_KEY' } } }
  const host = contextStub({ settings: { 'usage-state': settings } })
  const get = host.ctx.get.bind(host.ctx)
  let release: (() => void) | undefined
  const lookup = new Promise<void>(resolve => { release = resolve })
  host.ctx.get = name => name === 'credentials' ? {
    resolve: async (ref: string) => {
      if (ref === 'FIRST_KEY') await lookup
      return { value: ref === 'FIRST_KEY' ? 'first-test-key' : 'second-test-key', source: 'store' }
    },
    describe: async () => ({ configured: true, writable: true }),
  } : get(name)
  const service = createUsageState(host.ctx, deps(host, {
    fetch: async (_url, init) => ({
      ok: true, status: 200,
      json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: init.headers.authorization === 'Bearer first-test-key' ? '11' : '22' }] }),
    }),
  }))

  const pending = service.getState(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  settings.providers.deepseek.apiKeyRef = 'SECOND_KEY'
  host.emit('loader/volatile-update')
  await service.getState(true)
  release?.()
  const state = await pending

  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 22, currency: 'CNY' }])
})

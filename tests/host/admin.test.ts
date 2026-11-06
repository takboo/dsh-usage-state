import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeConfig } from '../../src/shared/config.ts'
import { resolveProvider } from '../../src/shared/providers.ts'
import { describeStatus } from '../../src/shared/display.ts'
import { toSourceCatalog } from '../../src/host/catalog.ts'
import { orderedCredentialRefs } from '../../src/host/credentials.ts'
import { providerCredentialRefs } from '../../src/host/provider-refs.ts'
import { findSource } from '../../src/host/sources/index.ts'
import { UsageStateStore } from '../../src/host/refresh.ts'
import { createUsageState, type PluginContextLike } from '../../src/index.ts'
import { usageStateViewSchema } from '../../src/host/typert.ts'
import type { UsageReading } from '../../src/shared/types.ts'

const NOW = Date.UTC(2026, 10, 6, 9)
const START = Date.UTC(2026, 10, 1)
const END = Date.UTC(2026, 11, 1)
const ADMIN_TARGET = { key: 'openai:admin', sourceId: 'openai', provider: 'openai', mode: 'admin', apiKeyRef: 'MY_ADMIN_KEY' } as const

function spend(amount: number | null, monthStart = START, monthEnd = END): UsageReading {
  return { balances: [], windows: [], currentMonthSpend: { amount, currency: 'USD', scope: 'organization', monthStart, monthEnd } }
}

function adminStore(read?: (signal: AbortSignal) => Promise<UsageReading>) {
  let now = NOW
  let secret = 'fake-admin-one'
  let ref = 'MY_ADMIN_KEY'
  const signals: AbortSignal[] = []
  const store = new UsageStateStore({
    clock: { now: () => now, after: () => () => {}, every: () => () => {} },
    policy: () => ({ intervalMinutes: 5, turnEndDelayMs: 2000, minIntervalSeconds: 60 }),
    targets: () => [{ ...ADMIN_TARGET, apiKeyRef: ref }],
    findSource,
    credentials: { resolve: async () => ({ apiKey: secret, ref, origin: 'store' }) },
    read: async (_target, _credential, _source, signal) => {
      signals.push(signal)
      return read === undefined ? spend(12.34) : read(signal)
    },
  })
  return { store, signals, setNow: (value: number) => { now = value }, setKey: (value: string) => { secret = value }, setRef: (value: string) => { ref = value } }
}

const flush = async () => { await new Promise<void>(resolve => setImmediate(resolve)) }

test('admin is explicit, normalizes only its own ref, and never inherits inference routing', () => {
  const config = normalizeConfig({
    providers: { openai: { mode: 'admin', adminKeyRef: ' MY_ADMIN_KEY ', apiKeyRef: 'INFERENCE', baseUrl: 'http://evil.example:8080' } },
    sources: { openai: { apiKeyRef: 'LEGACY', baseUrl: 'https://another.example' } },
  })
  assert.equal(config.providers.openai?.adminKeyRef, 'MY_ADMIN_KEY')
  const resolved = resolveProvider({ provider: 'openai', config, catalog: toSourceCatalog() })
  // Explicit source selection permits the billing account to differ from a gateway route.
  const selected = normalizeConfig({ ...config, providers: { openai: { ...config.providers.openai, sourceId: 'openai' } } })
  const official = resolveProvider({ provider: 'openai', config: selected, catalog: toSourceCatalog() })
  assert.equal(resolved.mode, null) // A custom inference endpoint still suggests a gateway.
  assert.equal(official.mode, 'admin')
  assert.equal(official.apiKeyRef, 'MY_ADMIN_KEY')
  assert.equal(official.baseUrl, 'https://api.openai.com')
  assert.equal(official.key, 'openai:admin')
  const missing = normalizeConfig({ providers: { openai: { mode: 'admin', apiKeyRef: 'INFERENCE' } }, sources: { openai: { apiKeyRef: 'LEGACY' } } })
  assert.equal(resolveProvider({ provider: 'openai', config: missing, catalog: toSourceCatalog() }).apiKeyRef, undefined)
  for (const mode of ['auto', 'api', 'account', 'coding-plan'] as const) {
    assert.equal(resolveProvider({ provider: 'openai', config: normalizeConfig({ providers: { openai: { mode, adminKeyRef: 'MY_ADMIN_KEY' } } }), catalog: toSourceCatalog() }).reason, 'capability-unavailable')
  }
})

test('Admin stays opt-in even without informational metadata and cannot be repurposed by another source', () => {
  const catalog = toSourceCatalog().map(({ unavailable: _unavailable, ...source }) => source)
  const automatic = resolveProvider({ provider: 'openai', config: normalizeConfig({}), catalog })
  assert.equal(automatic.mode, null)
  assert.equal(automatic.reason, 'unsupported')
  const other = resolveProvider({
    provider: 'other',
    config: normalizeConfig({ providers: { other: { sourceId: 'other', mode: 'admin', adminKeyRef: 'MANUAL_ADMIN' } } }),
    catalog: [{ ...catalog.find(source => source.id === 'openai')!, id: 'other' }],
  })
  assert.equal(other.mode, null)
  assert.equal(other.reason, 'unsupported')
})

test('admin credential resolution considers only the manually selected ref, even if discovery supplies candidates', () => {
  const source = findSource('openai')!
  assert.ok(source)
  assert.deepEqual(orderedCredentialRefs(source, 'admin', { overrideRef: ' MY_ADMIN_KEY ', preferredRefs: ['INFERENCE'] }), ['MY_ADMIN_KEY'])
  assert.deepEqual(orderedCredentialRefs(source, 'admin', { preferredRefs: ['INFERENCE'] }), [])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'openai', mode: 'admin', provider: 'openai', piAiSettings: { providers: { openai: { apiKeyEnv: 'INFERENCE', baseURL: 'https://api.openai.com/v1' } } } }), [])
})

test('admin reading survives store and RPC as spend, with zero distinct from no data', async () => {
  for (const amount of [12.34, 0, null]) {
    const { store } = adminStore(async () => spend(amount))
    const snapshot = await store.refresh(ADMIN_TARGET.key)
    assert.deepEqual(snapshot.currentMonthSpend, spend(amount).currentMonthSpend)
    assert.deepEqual(snapshot.balances, [])
    const view = { sources: toSourceCatalog(), snapshots: store.snapshots(), checkedAt: NOW }
    assert.deepEqual(usageStateViewSchema.parse(view), view)
    const segments = describeStatus({ sourceLabel: 'OpenAI', status: { kind: 'ready', key: ADMIN_TARGET.key, sourceId: 'openai', mode: 'admin' }, snapshot, display: normalizeConfig({}).display, now: NOW })
    assert.equal(segments.some(segment => segment.kind === 'balance' || segment.kind === 'window'), false)
    const segment = segments.find(segment => segment.kind === 'spend')
    assert.equal(segment?.kind === 'spend' ? segment.amount : undefined, amount === null ? null : `$${amount.toFixed(2)}`)
    store.stop()
  }
})

test('only same-identity same-month admin successes may survive a failed refresh', async () => {
  let failure = false
  const { store, setNow, setKey } = adminStore(async () => {
    if (failure) throw new Error('unavailable')
    return spend(12.34)
  })
  await store.refresh(ADMIN_TARGET.key)
  failure = true
  assert.equal((await store.refresh(ADMIN_TARGET.key, { force: true })).stale, true)
  setKey('fake-admin-two')
  assert.equal((await store.refresh(ADMIN_TARGET.key, { force: true })).currentMonthSpend, undefined)
  failure = false
  await store.refresh(ADMIN_TARGET.key, { force: true })
  setNow(END)
  assert.deepEqual(store.snapshots(), {})
  failure = true
  const nextMonth = await store.refresh(ADMIN_TARGET.key, { onlyIfMissing: true })
  assert.equal(nextMonth.currentMonthSpend, undefined)
  assert.equal(nextMonth.stale, undefined)
  store.stop()
})

test('month rollover invalidates a late admin response and re-reads the new UTC month', async () => {
  let finish: ((reading: UsageReading) => void) | undefined
  let reads = 0
  const { store, setNow, signals } = adminStore(async () => {
    reads++
    if (reads === 1) return new Promise(resolve => { finish = resolve })
    return spend(0, END, Date.UTC(2027, 0, 1))
  })
  setNow(END - 100)
  const request = store.refresh(ADMIN_TARGET.key)
  await flush()
  setNow(END + 100)
  finish!(spend(20))
  const snapshot = await request
  assert.equal(signals[0]?.aborted, true)
  assert.equal(reads, 2)
  assert.equal(snapshot.currentMonthSpend?.monthStart, END)
  assert.equal(store.snapshot(ADMIN_TARGET.key)?.currentMonthSpend?.amount, 0)
  store.stop()
})

test('routing and credential changes abort old admin HTTP while retaining only the new identity', async () => {
  for (const change of ['ref', 'key'] as const) {
    let finish: ((reading: UsageReading) => void) | undefined
    let reads = 0
    const { store, setKey, setRef, signals } = adminStore(async () => {
      reads++
      if (reads === 1) return new Promise(resolve => { finish = resolve })
      return spend(2)
    })
    const old = store.refresh(ADMIN_TARGET.key)
    await flush()
    if (change === 'ref') { setRef('OTHER_ADMIN'); store.reconfigure() }
    else setKey('fake-admin-two')
    const current = await store.refresh(ADMIN_TARGET.key)
    assert.equal(signals[0]?.aborted, true)
    assert.equal(current.currentMonthSpend?.amount, 2)
    finish!(spend(100))
    await old
    assert.equal(store.snapshot(ADMIN_TARGET.key)?.currentMonthSpend?.amount, 2)
    store.stop()
  }
})

test('Client never presents an expired month as this month even before the next Host poll', async () => {
  const { store } = adminStore()
  const snapshot = await store.refresh(ADMIN_TARGET.key)
  const segments = describeStatus({ sourceLabel: 'OpenAI', status: { kind: 'ready', key: ADMIN_TARGET.key, sourceId: 'openai', mode: 'admin' }, snapshot, display: normalizeConfig({}).display, now: END })
  assert.equal(segments.some(segment => segment.kind === 'spend'), false)
  assert.ok(segments.some(segment => segment.kind === 'state' && segment.state === 'loading'))
  store.stop()
})

test('assembled plugin never discovers an Admin key and uses the selected key only at fixed official HTTPS', async () => {
  for (const adminKeyRef of [undefined, 'MANUAL_ADMIN']) {
    const resolved: string[] = []
    const described: string[] = []
    const requests: URL[] = []
    const cleanups: Array<() => void> = []
    const ctx: PluginContextLike = {
      get: name => {
        if (name === 'llm') return { listProviders: () => [{ id: 'openai' }] }
        if (name === 'configEditor') return { entries: () => [{ options: { id: 'llm-pi-ai' }, fiber: { config: { providers: { openai: { apiKeyEnv: 'INFERENCE', baseURL: 'http://gateway.example:8080/v1' } } } } }] }
        if (name === 'credentials') return {
          resolve: async (ref: string) => { resolved.push(ref); return { value: 'fake-selected-admin', source: 'store' } },
          describe: async (ref: string) => { described.push(ref); return { configured: true, writable: true } },
        }
        return undefined
      },
      on: () => () => {}, provide: () => {},
      effect: callback => { const cleanup = callback(); if (cleanup !== undefined) cleanups.push(cleanup) },
      timeout: () => () => {}, interval: () => () => {},
    }
    const service = createUsageState(ctx, {
      config: { get: () => ({ providers: { openai: { mode: 'admin', sourceId: 'openai', adminKeyRef, apiKeyRef: 'INFERENCE', baseUrl: 'http://evil.example:8080' } }, sources: { openai: { apiKeyRef: 'LEGACY' } } }) },
      now: () => NOW, credentialFallback: false,
      fetch: async (url, init) => {
        requests.push(new URL(url))
        assert.equal(init?.redirect, 'error')
        assert.equal(init?.headers?.authorization, 'Bearer fake-selected-admin')
        return { ok: true, status: 200, json: async () => ({ object: 'page', data: [{ object: 'bucket', start_time: START / 1000, end_time: START / 1000 + 86400, results: [{ object: 'organization.costs.result', project_id: null, amount: { value: 1.25, currency: 'usd' } }] }], has_more: false, next_page: null }) }
      },
    })
    const report = await service.describeCredentials()
    const view = await service.getState(true)
    const snapshot = view.snapshots['openai:admin']
    if (adminKeyRef === undefined) {
      assert.deepEqual(resolved, [])
      assert.deepEqual(described, [])
      assert.equal(requests.length, 0)
      assert.deepEqual(report.credentials['openai:admin']?.candidates, [])
      assert.equal(report.credentials['openai:admin']?.configured, false)
      assert.equal(report.credentials['openai:admin']?.ref, undefined)
      assert.equal(snapshot?.error?.kind, 'config')
    } else {
      assert.deepEqual(resolved, [adminKeyRef])
      assert.deepEqual(described, [adminKeyRef])
      assert.equal(requests.length, 1)
      assert.equal(requests[0]?.origin, 'https://api.openai.com')
      assert.equal(requests[0]?.pathname, '/v1/organization/costs')
      assert.equal(requests[0]?.searchParams.get('start_time'), String(START / 1000))
      assert.equal(requests[0]?.searchParams.has('end_time'), false)
      assert.equal(snapshot?.currentMonthSpend?.amount, 1.25)
    }
    assert.equal(JSON.stringify({ report, view }).includes('fake-selected-admin'), false)
    for (const cleanup of cleanups) cleanup()
  }
})

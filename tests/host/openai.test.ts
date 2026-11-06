import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeConfig, suggestSourceId } from '../../src/shared/config.ts'
import { resolveProvider } from '../../src/shared/providers.ts'
import { toSourceCatalog } from '../../src/host/catalog.ts'
import { usageStateViewSchema } from '../../src/host/typert.ts'
import { ALL_SOURCES, findSource } from '../../src/host/sources/index.ts'
import { resolveTargets } from '../../src/host/targets.ts'
import { UsageStateStore } from '../../src/host/refresh.ts'
import { buildProviderRows } from '../../src/client/provider-rows.ts'

const BILLING_URL = 'https://platform.openai.com/settings/organization/billing/overview'

test('official OpenAI is recognized without mistaking OpenAI-compatible gateways or spoof hosts for it', () => {
  assert.equal(suggestSourceId('openai'), 'openai')
  assert.equal(suggestSourceId('openai-official'), 'openai')
  assert.equal(suggestSourceId('custom', 'https://api.openai.com/v1'), 'openai')
  assert.equal(suggestSourceId('sub2api-openai', 'https://api.openai.com/v1'), 'openai')
  assert.equal(suggestSourceId('openai', 'https://gateway.example/v1'), 'sub2api')
  assert.equal(suggestSourceId('my-openai-gateway', 'https://gateway.example/v1'), 'sub2api')
  assert.equal(suggestSourceId('sub2api-openai'), 'sub2api')
  assert.equal(suggestSourceId('my-openai-gateway'), undefined)
  for (const endpoint of [
    'https://api.openai.com.evil.example/v1',
    'https://evil.api.openai.com/v1',
    'https://api.openai.com@evil.example/v1',
  ]) assert.equal(suggestSourceId('openai', endpoint), 'sub2api')
})

test('OpenAI is an informational, RPC-safe capability entry, not a fake UsageSource', () => {
  assert.equal(findSource('openai'), undefined)
  assert.equal(ALL_SOURCES.some(source => source.id === 'openai'), false)
  const sources = toSourceCatalog()
  const entry = sources.find(source => source.id === 'openai')
  assert.deepEqual(entry, {
    id: 'openai', displayName: 'OpenAI', modes: [], requiresBaseUrl: false,
    defaultBaseUrl: {}, credentialRefs: {},
    unavailable: { reason: 'openai-public-api', billingUrl: BILLING_URL },
  })
  const view = { sources, snapshots: {}, checkedAt: 0 }
  assert.deepEqual(usageStateViewSchema.parse(JSON.parse(JSON.stringify(view))), view)
  assert.throws(() => usageStateViewSchema.parse({ ...view, sources: [{
    ...entry, unavailable: { reason: 'openai-public-api', billingUrl: 'javascript:alert(1)' },
  }] }))
})

test('official OpenAI has a truthful unavailable reason and no key or pollable mode, even when explicitly configured', () => {
  for (const mode of ['auto', 'api', 'account', 'coding-plan'] as const) {
    const config = normalizeConfig({ providers: { openai: { mode } } })
    const resolved = resolveProvider({ provider: 'openai', config, catalog: toSourceCatalog() })
    assert.equal(resolved.reason, 'capability-unavailable')
    assert.equal(resolved.sourceId, 'openai')
    assert.equal(resolved.mode, null)
    assert.equal(resolved.key, undefined)
    assert.deepEqual(resolveTargets(config, { providers: ['openai'] }), [])
  }
  const config = normalizeConfig({ providers: { openai: { mode: 'hidden' } } })
  assert.equal(resolveProvider({ provider: 'openai', config, catalog: toSourceCatalog() }).reason, 'hidden')
})

test('a gateway override on the OpenAI provider stays owned by that gateway; an official endpoint cannot be polled as Sub2API', () => {
  const gateway = normalizeConfig({ providers: { openai: { mode: 'api', baseUrl: 'https://gateway.example' } } })
  assert.deepEqual(resolveTargets(gateway, { providers: ['openai'] }), [{
    key: 'sub2api:api', sourceId: 'sub2api', provider: 'openai', mode: 'api',
    baseUrl: 'https://gateway.example', baseUrlPinned: true,
  }])
  const official = normalizeConfig({ providers: { custom: {
    mode: 'api', sourceId: 'sub2api', baseUrl: 'https://api.openai.com/v1', apiKeyRef: 'FAKE_OPENAI_KEY',
  } } })
  assert.deepEqual(resolveTargets(official, { providers: ['custom'] }), [])
  const [row] = buildProviderRows({
    models: [{ provider: 'custom', providerName: 'OpenAI', model: 'gpt-test', name: 'GPT test' }],
    config: official, catalog: toSourceCatalog(),
  })
  assert.equal(row?.resolution.reason, 'capability-unavailable')
  assert.deepEqual(row?.modes, ['auto', 'hidden'])
})

test('DeepSeek account mode still ignores irrelevant API endpoint and key overrides', () => {
  for (const [provider, entry] of [
    ['custom-account', { mode: 'account', sourceId: 'deepseek', baseUrl: 'https://api.openai.com', apiKeyRef: 'IGNORED_KEY' }],
    ['deepseek-account', { mode: 'account', baseUrl: 'https://api.openai.com', apiKeyRef: 'IGNORED_KEY' }],
    ['deepseek-account', { mode: 'auto', baseUrl: 'https://api.openai.com', apiKeyRef: 'IGNORED_KEY' }],
  ] as const) {
    const config = normalizeConfig({ providers: { [provider]: entry } })
    const resolved = resolveProvider({ provider, config, catalog: toSourceCatalog(), endpointHint: 'https://api.openai.com/v1' })
    assert.equal(resolved.sourceId, 'deepseek')
    assert.equal(resolved.mode, 'account')
    assert.equal(resolved.key, 'deepseek:account')
    assert.notEqual(resolved.reason, 'capability-unavailable')
  }
})

test('normal and forced OpenAI refresh never resolve credentials or perform HTTP', async () => {
  let credentialLookups = 0
  let networkReads = 0
  const config = normalizeConfig({ providers: { openai: { mode: 'api' } } })
  const store = new UsageStateStore({
    clock: { now: () => 0, after: () => () => {}, every: () => () => {} },
    policy: () => config.refresh,
    targets: () => resolveTargets(config, { providers: ['openai'], endpointHints: { openai: 'https://api.openai.com/v1' } }),
    findSource,
    credentials: { resolve: async () => {
      credentialLookups++
      return { apiKey: 'fake-openai-key', ref: 'OPENAI_API_KEY', origin: 'store' }
    } },
    read: async () => {
      networkReads++
      throw new Error('No OpenAI HTTP request is allowed')
    },
  })
  await store.refreshAll()
  await store.refresh('openai:api', { force: true })
  // A stale gateway key must not become a back door to /v1/usage either.
  await store.refresh('sub2api:api', { force: true })
  assert.equal(credentialLookups, 0)
  assert.equal(networkReads, 0)
  assert.deepEqual(store.snapshots(), {})
  store.stop()
})

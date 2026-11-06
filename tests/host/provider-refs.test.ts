import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeConfig } from '../../src/shared/config.ts'
import { providerCredentialRefs, providerEndpointHints } from '../../src/host/provider-refs.ts'

const PI_AI = {
  providers: {
    orcarouter: { apiKeyEnv: 'ORCAROUTER_API_KEY', baseURL: 'https://api.orcarouter.ai/v1', models: [] },
    'glm-coding': { apiKeyEnv: 'GLM_KEY', baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
    'kimi-code': { apiKeyEnv: 'KIMI_KEY', baseURL: 'https://api.kimi.com/coding/v1' },
    anonymous: { baseURL: 'https://api.deepseek.com/v1' },
  },
}

test('the native DeepSeek namespace contributes only to its own provider', () => {
  for (const provider of ['deepseek', 'deepseek-official']) {
    assert.deepEqual(providerCredentialRefs({ provider, sourceId: 'deepseek', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }), ['MY_DS_KEY'])
  }
  assert.deepEqual(providerCredentialRefs({ provider: 'relay', sourceId: 'deepseek', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }), [])
  assert.deepEqual(providerCredentialRefs({ provider: 'deepseek', sourceId: 'zai', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }), [])
  assert.deepEqual(providerCredentialRefs({ provider: 'deepseek', sourceId: 'deepseek', baseUrl: 'https://relay.example', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }), [])
})

test('pi-ai discovery reads only the owner profile and never aggregates by source', () => {
  assert.deepEqual(providerCredentialRefs({ provider: 'orcarouter', sourceId: 'sub2api', piAiSettings: PI_AI }), ['ORCAROUTER_API_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'glm-coding', sourceId: 'zai', piAiSettings: PI_AI }), ['GLM_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'kimi-code', sourceId: 'kimi', piAiSettings: PI_AI }), ['KIMI_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'sub2api', piAiSettings: PI_AI }), [])
  assert.deepEqual(providerCredentialRefs({ provider: 'anonymous', sourceId: 'deepseek', piAiSettings: PI_AI, deepseekSettings: { apiKeyEnv: 'NATIVE_KEY' } }), [])
})

test('two OpenCode routes each discover only their own ref', () => {
  const piAiSettings = { providers: {
    'opencode-go': { apiKeyEnv: 'GO_KEY' },
    'opencode-go-deepseek': { apiKeyEnv: 'OTHER_GO_KEY', baseURL: 'https://opencode.ai/zen/go/v1' },
  } }
  assert.deepEqual(providerCredentialRefs({ provider: 'opencode-go', sourceId: 'opencode', piAiSettings }), ['GO_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'opencode-go-deepseek', sourceId: 'opencode', piAiSettings }), ['OTHER_GO_KEY'])
})

test('refs are trimmed and never invented from blank or non-string values', () => {
  for (const [apiKeyEnv, expected] of [[' MY_DS_KEY ', ['MY_DS_KEY']], ['', []], [42, []]] as const) {
    assert.deepEqual(providerCredentialRefs({ provider: 'deepseek', sourceId: 'deepseek', deepseekSettings: { apiKeyEnv } }), expected)
  }
})

test('malformed settings documents are simply ignored', () => {
  for (const input of [
    { sourceId: 'deepseek' },
    { sourceId: 'deepseek', deepseekSettings: null, piAiSettings: 'nope' },
    { sourceId: 'deepseek', deepseekSettings: [], piAiSettings: { providers: [] } },
    { sourceId: 'deepseek', piAiSettings: { providers: { deepseek: null, other: 'x' } } },
  ]) {
    assert.deepEqual(providerCredentialRefs({ provider: 'deepseek', ...input }), [])
  }
})

test('credential discovery honors explicit source overrides instead of guessing again', () => {
  const piAiSettings = { providers: { 'my-kimi': { apiKeyEnv: 'RELAY_KEY', baseURL: 'https://relay.example/v1' } } }
  const config = normalizeConfig({ providers: { 'my-kimi': { sourceId: 'sub2api' } } })
  assert.deepEqual(providerCredentialRefs({ provider: 'my-kimi', sourceId: 'sub2api', mode: 'api', piAiSettings, config }), ['RELAY_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'my-kimi', sourceId: 'kimi', mode: 'api', piAiSettings, config }), [])
})

test('hidden, unsupported and account-mode providers do not contribute API credentials', () => {
  const piAiSettings = { providers: {
    'sub2api-hidden': { apiKeyEnv: 'HIDDEN_KEY', baseURL: 'https://hidden.example/v1' },
    'sub2api-unsupported': { apiKeyEnv: 'UNSUPPORTED_KEY', baseURL: 'https://unsupported.example/v1' },
  } }
  const config = normalizeConfig({ providers: {
    'sub2api-hidden': { mode: 'hidden' }, 'sub2api-unsupported': { mode: 'account' },
  } })
  for (const provider of Object.keys(piAiSettings.providers)) {
    assert.deepEqual(providerCredentialRefs({ provider, sourceId: 'sub2api', piAiSettings, config }), [])
  }
  assert.deepEqual(providerCredentialRefs({ provider: 'deepseek-official', sourceId: 'deepseek', mode: 'account', deepseekSettings: { apiKeyEnv: 'KEY' } }), [])
})

test('changing a provider origin cannot silently reuse its declared credential', () => {
  assert.deepEqual(providerCredentialRefs({ provider: 'orcarouter', sourceId: 'sub2api', baseUrl: 'https://different.example', piAiSettings: PI_AI }), [])
  assert.deepEqual(providerCredentialRefs({ provider: 'orcarouter', sourceId: 'sub2api', baseUrl: 'https://api.orcarouter.ai', piAiSettings: PI_AI }), ['ORCAROUTER_API_KEY'])
})

test('providerEndpointHints reports each configured endpoint, trimmed', () => {
  assert.deepEqual(providerEndpointHints(PI_AI), {
    orcarouter: 'https://api.orcarouter.ai/v1',
    'glm-coding': 'https://open.bigmodel.cn/api/paas/v4',
    'kimi-code': 'https://api.kimi.com/coding/v1',
    anonymous: 'https://api.deepseek.com/v1',
  })
  assert.deepEqual(providerEndpointHints({ providers: { a: { baseURL: '  ' }, b: 'x' } }), {})
  assert.deepEqual(providerEndpointHints(undefined), {})
})

test('Moonshot and Kimi Code owner refs stay within their billing mode', () => {
  const piAiSettings = { providers: {
    moonshot: { apiKeyEnv: 'WALLET_KEY', baseURL: 'https://api.moonshot.cn/v1' },
    kimi: { apiKeyEnv: 'CODE_KEY', baseURL: 'https://api.kimi.ai/coding/v1' },
  } }
  assert.deepEqual(providerCredentialRefs({ provider: 'moonshot', sourceId: 'kimi', mode: 'api', piAiSettings }), ['WALLET_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'kimi', sourceId: 'kimi', mode: 'coding-plan', piAiSettings }), ['CODE_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'moonshot', sourceId: 'kimi', mode: 'coding-plan', piAiSettings }), [])
})

test('Kimi ref filtering honors explicit modes, endpoint pins and hidden routes', () => {
  const piAiSettings = { providers: {
    'kimi-code': { apiKeyEnv: 'OVERRIDE_KEY' }, 'kimi-coding': { apiKeyEnv: 'HIDDEN_KEY' },
    kimi: { apiKeyEnv: 'PINNED_KEY', baseURL: 'https://api.kimi.ai/coding/v1' },
  } }
  const config = normalizeConfig({ providers: {
    'kimi-code': { mode: 'api' }, 'kimi-coding': { mode: 'hidden' }, kimi: { baseUrl: 'https://api.kimi.ai' },
  } })
  assert.deepEqual(providerCredentialRefs({ provider: 'kimi-code', sourceId: 'kimi', mode: 'api', piAiSettings, config }), ['OVERRIDE_KEY'])
  assert.deepEqual(providerCredentialRefs({ provider: 'kimi-coding', sourceId: 'kimi', mode: 'coding-plan', piAiSettings, config }), [])
  assert.deepEqual(providerCredentialRefs({ provider: 'kimi', sourceId: 'kimi', mode: 'coding-plan', piAiSettings, config }), ['PINNED_KEY'])
})

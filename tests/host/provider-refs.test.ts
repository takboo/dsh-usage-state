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

const OPENCODE_PI_AI = {
  providers: {
    'opencode-go': { apiKeyEnv: 'OPENCODE_GO_API_KEY' },
    'opencode-go-deepseek': { apiKeyEnv: 'OPENCODE_GO_API_KEY', baseURL: 'https://opencode.ai/zen/go/v1' },
  },
}

test('the llm-deepseek namespace contributes its apiKeyEnv for the deepseek source', () => {
  assert.deepEqual(
    providerCredentialRefs({ sourceId: 'deepseek', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }),
    ['MY_DS_KEY'],
  )
  assert.deepEqual(
    providerCredentialRefs({ sourceId: 'zai', deepseekSettings: { apiKeyEnv: 'MY_DS_KEY' } }),
    [],
  )
})

test('pi-ai providers contribute their apiKeyEnv when the provider resolves to the source', () => {
  assert.deepEqual(providerCredentialRefs({ sourceId: 'sub2api', piAiSettings: PI_AI }), ['ORCAROUTER_API_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'zai', piAiSettings: PI_AI }), ['GLM_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', piAiSettings: PI_AI }), ['KIMI_KEY'])
})

test('both OpenCode Go routes contribute their apiKeyEnv, deduplicated, to the opencode source', () => {
  assert.deepEqual(providerCredentialRefs({ sourceId: 'opencode', piAiSettings: OPENCODE_PI_AI }), [
    'OPENCODE_GO_API_KEY',
  ])
  // The source's own built-in probes still apply after the discovered refs.
  assert.deepEqual(providerCredentialRefs({ sourceId: 'opencode', piAiSettings: PI_AI }), [])
})

test('a provider without apiKeyEnv contributes nothing, and order follows the document', () => {
  assert.deepEqual(providerCredentialRefs({ sourceId: 'deepseek', piAiSettings: PI_AI }), [])
})

test('refs are trimmed, deduplicated and never invented from non-strings', () => {
  assert.deepEqual(
    providerCredentialRefs({
      sourceId: 'deepseek',
      deepseekSettings: { apiKeyEnv: ' DEEPSEEK_API_KEY ' },
      piAiSettings: { providers: { a: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' } } },
    }),
    ['DEEPSEEK_API_KEY'],
  )
  assert.deepEqual(
    providerCredentialRefs({
      sourceId: 'deepseek',
      deepseekSettings: { apiKeyEnv: 42 },
      piAiSettings: { providers: { a: { apiKeyEnv: '', baseURL: 'https://api.deepseek.com' } } },
    }),
    [],
  )
})

test('malformed settings documents are simply ignored', () => {
  for (const input of [
    { sourceId: 'deepseek' },
    { sourceId: 'deepseek', deepseekSettings: null, piAiSettings: 'nope' },
    { sourceId: 'deepseek', deepseekSettings: [], piAiSettings: { providers: [] } },
    { sourceId: 'deepseek', piAiSettings: { providers: { a: null, b: 'x' } } },
  ]) {
    assert.deepEqual(providerCredentialRefs(input), [], `expected nothing for ${JSON.stringify(input)}`)
  }
})

test('credential discovery honors explicit source overrides instead of guessing again', () => {
  const piAiSettings = { providers: {
    'my-kimi': { apiKeyEnv: 'RELAY_KEY', baseURL: 'https://relay.example/v1' },
  } }
  const config = normalizeConfig({ providers: { 'my-kimi': { sourceId: 'sub2api' } } })

  assert.deepEqual(providerCredentialRefs({ sourceId: 'sub2api', mode: 'api', piAiSettings, config }), ['RELAY_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', mode: 'api', piAiSettings, config }), [])
})

test('hidden and unsupported providers do not contribute credentials to another target', () => {
  const piAiSettings = { providers: {
    'sub2api-hidden': { apiKeyEnv: 'HIDDEN_KEY', baseURL: 'https://hidden.example/v1' },
    'sub2api-unsupported': { apiKeyEnv: 'UNSUPPORTED_KEY', baseURL: 'https://unsupported.example/v1' },
  } }
  const config = normalizeConfig({ providers: {
    'sub2api-hidden': { mode: 'hidden' },
    'sub2api-unsupported': { mode: 'account' },
  } })

  assert.deepEqual(providerCredentialRefs({ sourceId: 'sub2api', piAiSettings, config }), [])
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


test('Moonshot and Kimi Code provider refs stay within their billing mode', () => {
  const piAiSettings = { providers: {
    moonshot: { apiKeyEnv: 'WALLET_KEY', baseURL: 'https://api.moonshot.cn/v1' },
    kimi: { apiKeyEnv: 'CODE_KEY', baseURL: 'https://api.kimi.ai/coding/v1' },
  } }
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', mode: 'api', piAiSettings }), ['WALLET_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', mode: 'coding-plan', piAiSettings }), ['CODE_KEY'])
})


test('Kimi ref filtering honors explicit modes, endpoint pins and hidden routes', () => {
  const piAiSettings = { providers: {
    'kimi-code': { apiKeyEnv: 'OVERRIDE_KEY' },
    'kimi-coding': { apiKeyEnv: 'HIDDEN_KEY' },
    kimi: { apiKeyEnv: 'PINNED_KEY' },
  } }
  const config = normalizeConfig({ providers: {
    'kimi-code': { mode: 'api' }, 'kimi-coding': { mode: 'hidden' }, kimi: { baseUrl: 'https://api.kimi.ai' },
  } })
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', mode: 'api', piAiSettings, config }), ['OVERRIDE_KEY'])
  assert.deepEqual(providerCredentialRefs({ sourceId: 'kimi', mode: 'coding-plan', piAiSettings, config }), ['PINNED_KEY'])
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { createCredentialLookup, type PluginContextLike } from '../../src/index.ts'

test('a credential service activated after this plugin takes precedence over direct fallbacks', async () => {
  let provider: unknown
  const ctx = { get: () => provider } as unknown as PluginContextLike
  const lookup = createCredentialLookup(ctx, {
    environment: { TEST_USAGE_KEY: 'environment-fixture' },
    credentialsPath: '/nonexistent/usage-state-fixture',
  })

  assert.deepEqual(await lookup.resolve('TEST_USAGE_KEY'), { value: 'environment-fixture', source: 'env (direct)' })
  provider = {
    resolve: async () => ({ value: 'saved-fixture', source: 'file' }),
    describe: async () => ({ configured: true, source: 'file', writable: true }),
  }
  assert.deepEqual(await lookup.resolve('TEST_USAGE_KEY'), { value: 'saved-fixture', source: 'file' })
  assert.deepEqual(await lookup.describe('TEST_USAGE_KEY'), { configured: true, source: 'file', writable: true })
})

test('credential lookups follow service replacement and removal without retaining a disposed provider', async () => {
  const providerFor = (value: string) => ({
    resolve: async () => ({ value, source: 'file' }),
    describe: async () => ({ configured: true, source: 'file', writable: true }),
  })
  let provider: unknown = providerFor('first-fixture')
  const ctx = { get: () => provider } as unknown as PluginContextLike
  const lookup = createCredentialLookup(ctx, false)

  assert.equal((await lookup.resolve('TEST_USAGE_KEY'))?.value, 'first-fixture')
  provider = providerFor('replacement-fixture')
  assert.equal((await lookup.resolve('TEST_USAGE_KEY'))?.value, 'replacement-fixture')
  provider = undefined
  assert.equal(await lookup.resolve('TEST_USAGE_KEY'), undefined)
  assert.deepEqual(await lookup.describe('TEST_USAGE_KEY'), { configured: false, writable: false })
})

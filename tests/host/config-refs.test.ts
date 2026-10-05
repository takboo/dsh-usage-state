import test from 'node:test'
import assert from 'node:assert/strict'

import z from '@deepseek-ai/schemastery'

import { isVolatileRef, plainConfig } from '../../src/index.ts'

/** Parse a sample through a real schema, failing loudly instead of silently. */
function resolve(schema: unknown, value: unknown): unknown {
  const standard = (schema as { '~standard': { validate(input: unknown): unknown } })['~standard']
  const result = standard.validate(value) as { value?: unknown; issues?: unknown }
  if (result.issues !== undefined) throw new Error(`schema rejected the sample: ${JSON.stringify(result.issues)}`)
  return result.value
}

/**
 * DSH 0.2 hands other plugins' resolved configuration over with volatile fields
 * wrapped in live references (`cosmokit.volatile.write`). Reading `llm-pi-ai` for
 * endpoint and credential hints goes through this detachment step, so it has to
 * recognise the real references and unwrap them at every depth.
 */
test('real schemastery volatile references are recognised and read out', () => {
  const schema = z.object({
    apiKeyEnv: z.string().volatile(),
    providers: z.dict(z.object({ baseURL: z.string() })).volatile(),
  })
  const resolved = resolve(schema, {
    apiKeyEnv: 'ZAI_CODING_CN_API_KEY',
    providers: { 'zai-coding': { baseURL: 'https://api.z.ai/api/paas/v4' } },
  }) as Record<string, unknown>

  assert.equal(isVolatileRef(resolved.apiKeyEnv), true)
  assert.equal(isVolatileRef(resolved.providers), true)
  assert.deepEqual(plainConfig(resolved), {
    apiKeyEnv: 'ZAI_CODING_CN_API_KEY',
    providers: { 'zai-coding': { baseURL: 'https://api.z.ai/api/paas/v4' } },
  })
})

test('references nested inside ordinary objects and arrays are unwrapped too', () => {
  // A volatile field needs a fixed object path, so this — not a volatile array
  // element — is the shape a real config produces.
  const inner = resolve(z.object({ token: z.string().volatile() }), { token: 'a' })
  const value = { rows: [inner, inner], label: 'x' }

  assert.deepEqual(plainConfig(value), { rows: [{ token: 'a' }, { token: 'a' }], label: 'x' })
})

test('ordinary configuration passes through detached, not by reference', () => {
  const source = { providers: { zai: { apiKeyEnv: 'KEY' } }, order: ['zai'] }
  const detached = plainConfig(source) as typeof source

  assert.deepEqual(detached, source)
  assert.notEqual(detached, source)
  assert.notEqual(detached.providers, source.providers)
})

test('a getter-shaped object without the volatile symbol is treated as data', () => {
  // Duck-typing on `get` alone would mangle any ordinary config field that happens
  // to be an object with a `get` method — so the shared symbol is part of the test.
  assert.equal(isVolatileRef({ get: () => 'value' }), false)
  const kept = plainConfig({ get: () => 'value' }) as { get: unknown }
  assert.equal(typeof kept.get, 'function')

  assert.equal(isVolatileRef(undefined), false)
  assert.equal(isVolatileRef(null), false)
  assert.equal(isVolatileRef('text'), false)
})

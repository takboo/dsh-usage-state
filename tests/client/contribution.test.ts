import test from 'node:test'
import assert from 'node:assert/strict'

import { CONTRIBUTION, type DescriptorLike } from '../../src/client/contribution.ts'
import { realRegistry } from '../support/browser-face.mjs'

/**
 * The browser half's wire contract, checked against the platform's **real** Typert
 * registry rather than against our own idea of it.
 *
 * This exists because 0.4.0 shipped a contribution that mounted fine on DSH 0.1.5
 * and was rejected outright by 0.2: the registry began requiring a `create()`
 * factory on every non-`src-json` codec, the mount rejection was swallowed, and the
 * only symptom was a status line with no readings. A hand-written mirror of a
 * platform contract is exactly what needs a check like this — "the entry activated"
 * and "the bundle loads" both passed while every reading was missing.
 */

const endpointOf = (descriptor: DescriptorLike): string => `${descriptor.namespace}/${descriptor.method}`

test('the real 0.2 registry accepts the contribution the browser half mounts', async () => {
  const registry = await realRegistry()

  // Throws — and therefore breaks every reading — if any descriptor violates the
  // platform's rules, which is precisely how 0.4.0 failed.
  await registry.register(CONTRIBUTION)

  for (const descriptor of CONTRIBUTION.descriptors) {
    assert.notEqual(registry.lookup(endpointOf(descriptor)), undefined, `${endpointOf(descriptor)} must resolve`)
  }
})

test('every strict codec carries the factory 0.2 requires', () => {
  // Kept as a plain unit assertion as well: it names the requirement directly, so a
  // failure says what is wrong even when the platform's registry cannot be loaded.
  for (const descriptor of CONTRIBUTION.descriptors) {
    for (const parameter of descriptor.parameters) {
      assert.equal(parameter.codec.mode, 'strict')
      assert.equal(typeof parameter.codec.create, 'function', `${descriptor.id} codec needs create()`)
      const validator = parameter.codec.create()
      assert.equal(typeof validator.parse, 'function', `${descriptor.id} codec must decode through parse()`)
    }
  }
})

test('the contribution stays a faithful mirror of the host manifest', async () => {
  // The two faces are hand-written on purpose (the browser bundle must not carry
  // zod), so everything the wire depends on is asserted equal.
  const { TYPERT } = (await import('../../src/host/typert.ts')) as {
    TYPERT: {
      package: string
      invocations: ReadonlyArray<{
        id: string
        service: string
        namespace: string
        method: string
        parameters: ReadonlyArray<{ name: string; wire: string }>
      }>
    }
  }

  assert.equal(CONTRIBUTION.package, TYPERT.package)
  assert.deepEqual(
    CONTRIBUTION.descriptors.map(descriptor => ({
      id: descriptor.id,
      service: descriptor.service,
      namespace: descriptor.namespace,
      method: descriptor.method,
      parameters: descriptor.parameters.map(parameter => ({ name: parameter.name, wire: parameter.wire })),
    })),
    TYPERT.invocations.map(invocation => ({
      id: invocation.id,
      service: invocation.service,
      namespace: invocation.namespace,
      method: invocation.method,
      parameters: invocation.parameters.map(parameter => ({ name: parameter.name, wire: parameter.wire })),
    })),
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  Config,
  installUsageStateSettings,
  USAGE_STATE_NS,
  type HostContextLike,
  type VolatileLike,
} from '../../src/host/settings.ts'
import { DEFAULT_CONFIG, type UsageStateConfig } from '../../src/shared/config.ts'

/**
 * The schema surface the loader itself uses. It is read structurally here on
 * purpose: these assertions are about the *platform contract* this plugin's config
 * relies on, so a host bump that changes it has to fail this test rather than fail
 * a boot.
 */
const schema = Config as unknown as {
  meta?: { volatile?: boolean }
  '~standard': { vendor: string; validate(value: unknown): { value: VolatileLike<unknown> } }
}

/** The symbol `cosmokit.isVolatile` — and this plugin's own duck-type — test for. */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

test('the namespace is the profile entry id the client binds', () => {
  assert.equal(USAGE_STATE_NS, 'usage-state')
  assert.match(USAGE_STATE_NS, /^[a-z][a-z0-9-]*$/)
})

test('Config is a volatile schemastery, which is what makes the entry live', () => {
  // `resolveConfig` validates through `Config['~standard']`, and the loader only
  // treats a config change as volatile-only for a real schemastery schema.
  assert.equal(schema['~standard'].vendor, 'schemastery')
  assert.equal(schema.meta?.volatile, true)
})

test('a volatile root arrives as a reference, not as plain data', () => {
  const { value } = schema['~standard'].validate({ providers: { zai: { mode: 'api' } } })
  assert.equal(typeof value.get, 'function')
  assert.ok(VOLATILE_WRITE in (value as object), 'the reference must carry the shared volatile symbol')
  assert.deepEqual(value.get(), { providers: { zai: { mode: 'api' } } })
})

test('Config passes any document through unchanged, so no field can be dropped', () => {
  // A declared object schema would project the settings form through its own dict
  // and drop every key it does not declare — including keys a hand-edited document
  // carries. `any` is what keeps the projection lossless.
  const dirty = { futureKey: { kept: true }, display: { progressBar: false } }
  assert.deepEqual(schema['~standard'].validate(dirty).value.get(), dirty)

  // An entry with no config at all is the common case for a fresh install, and it
  // must resolve rather than reject: a rejection here would fail the plugin entry.
  assert.equal(schema['~standard'].validate(undefined).value.get(), undefined)
})

function referenceStub(initial: unknown): { reference: VolatileLike<unknown>; write: (next: unknown) => void } {
  let current = initial
  return {
    reference: { get: () => current },
    write: next => {
      current = next
    },
  }
}

function hostStub(): { ctx: HostContextLike; emit: (event: string, ...args: unknown[]) => void } {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    ctx: {
      on(event, handler) {
        listeners.set(event, [...(listeners.get(event) ?? []), handler])
        return () => undefined
      },
    },
    emit(event, ...args) {
      for (const handler of listeners.get(event) ?? []) handler(...args)
    },
  }
}

test('installing keeps a live snapshot, starting from the stored value', () => {
  const { reference, write } = referenceStub({ display: { progressBar: false } })
  const host = hostStub()
  const seen: UsageStateConfig[] = []

  installUsageStateSettings(host.ctx, reference, config => seen.push(config))

  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.display.progressBar, false)
  // The stored section is normalized, so a partial document still yields a whole config.
  assert.equal(seen[0]?.refresh.intervalMinutes, DEFAULT_CONFIG.refresh.intervalMinutes)

  write({ refresh: { intervalMinutes: 15 } })
  host.emit('loader/volatile-update', [])
  assert.equal(seen.length, 2)
  assert.equal(seen[1]?.refresh.intervalMinutes, 15)
  assert.equal(seen[1]?.display.progressBar, true)
})

test('a garbage document degrades to defaults instead of throwing', () => {
  const { reference } = referenceStub('garbage')
  const host = hostStub()
  const seen: UsageStateConfig[] = []

  installUsageStateSettings(host.ctx, reference, config => seen.push(config))

  assert.deepEqual(seen, [DEFAULT_CONFIG])
})

test('installing is a no-op on a host that hands over no reference', () => {
  const host = hostStub()
  let called = 0

  installUsageStateSettings(host.ctx, undefined, () => {
    called += 1
  })
  host.emit('loader/volatile-update', [])

  assert.equal(called, 0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'

import { createTargetReader, DEFAULT_TIMEOUT_MS, readUsage } from '../../src/host/read.ts'
import { UsageStateStore } from '../../src/host/refresh.ts'
import { deepseek } from '../../src/host/sources/deepseek.ts'
import { zai } from '../../src/host/sources/zai.ts'

const BALANCE = { balance_infos: [{ currency: 'CNY', total_balance: '10' }] }
const POLICY = { intervalMinutes: 5, turnEndDelayMs: 2000, minIntervalSeconds: 60 }
const CLOCK = { now: () => 0, after: () => () => {}, every: () => () => {} }
const CREDENTIAL = { apiKey: 'fake-key', ref: 'FAKE_KEY', origin: 'store' }

async function flush(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

test('timeoutMs zero still propagates owner abort and prevents a fallback', async () => {
  const owner = new AbortController()
  let signal: AbortSignal | undefined
  let calls = 0
  const pending = readUsage({ source: zai, mode: 'coding-plan', apiKey: 'fake-key' }, {
    signal: owner.signal,
    timeoutMs: 0,
    fetch: async (_url, init) => {
      calls++
      signal = init.signal
      return await new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('fake aborted fetch')), { once: true })
      })
    },
  })
  const rejected = assert.rejects(pending, /request aborted/)
  owner.abort()
  await rejected
  assert.equal(signal?.aborted, true)
  assert.equal(calls, 1)
})

test('owner cancellation during JSON decoding discards a late payload without trying a mirror', async () => {
  const owner = new AbortController()
  let release: (() => void) | undefined
  const json = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  const pending = readUsage({ source: zai, mode: 'coding-plan', apiKey: 'fake-key' }, {
    signal: owner.signal,
    fetch: async () => {
      calls++
      return { ok: true, status: 200, json: async () => {
        await json
        return { five_hour: { utilization: 0.25 } }
      } }
    },
  })
  await flush()
  owner.abort()
  release?.()
  await assert.rejects(pending, /request aborted/)
  assert.equal(calls, 1)
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
})

test('the default timeout aborts the composed signal without aborting its owner or leaking listeners', async t => {
  const owner = new AbortController()
  const timeout = new AbortController()
  const timeoutMock = t.mock.method(AbortSignal, 'timeout', () => timeout.signal)
  let observed: AbortSignal | undefined
  await assert.rejects(() => readUsage({ source: deepseek, mode: 'api', apiKey: 'fake-key' }, {
    signal: owner.signal,
    fetch: async (_url, init) => {
      observed = init.signal
      timeout.abort(new Error('fake timeout'))
      throw init.signal?.reason
    },
  }), /fake timeout/)
  assert.equal(timeoutMock.mock.calls[0]?.arguments[0], DEFAULT_TIMEOUT_MS)
  assert.equal(observed?.aborted, true)
  assert.equal(owner.signal.aborted, false)
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
  assert.equal(getEventListeners(timeout.signal, 'abort').length, 0)
})

test('successful HTTP reads remove owner and timeout bridge listeners', async t => {
  const owner = new AbortController()
  const timeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal)
  await readUsage({ source: deepseek, mode: 'api', apiKey: 'fake-key' }, {
    signal: owner.signal,
    fetch: async () => ({ ok: true, status: 200, json: async () => BALANCE }),
  })
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
  assert.equal(getEventListeners(timeout.signal, 'abort').length, 0)
})

test('an already cancelled owner never starts HTTP', async () => {
  const owner = new AbortController()
  owner.abort()
  let calls = 0
  await assert.rejects(() => readUsage({ source: deepseek, mode: 'api', apiKey: 'fake-key' }, {
    signal: owner.signal,
    fetch: async () => { calls++; throw new Error('must not fetch') },
  }), /request aborted/)
  assert.equal(calls, 0)
})

test('a credential lookup from a stopped lifetime cannot start HTTP even after restart', async () => {
  for (const restart of [false, true]) {
    let release: (() => void) | undefined
    const lookup = new Promise<void>(resolve => { release = resolve })
    let credentialCalls = 0
    let reads = 0
    const store = new UsageStateStore({
      clock: CLOCK, policy: () => POLICY,
      targets: () => [{ key: 'deepseek:api', sourceId: 'deepseek', mode: 'api' }],
      findSource: () => deepseek,
      credentials: { resolve: async () => { if (++credentialCalls === 1) await lookup; return CREDENTIAL } },
      read: async () => { reads++; return { balances: [{ amount: 10, currency: 'CNY' }], windows: [] } },
    })
    store.start()
    const pending = store.refresh('deepseek:api')
    await flush()
    store.stop()
    if (restart) store.start()
    release?.()
    const result = await pending
    assert.equal(reads, 0)
    assert.equal(result.error?.detail, 'refresh stopped')
    assert.deepEqual(store.snapshots(), {})
    if (restart) {
      await store.refresh('deepseek:api')
      assert.equal(reads, 1)
    }
    store.stop()
  }
})

test('a restarted store has a fresh signal and old HTTP cannot retry a mirror or replace new cache', async () => {
  const target = { key: 'zai:coding-plan', sourceId: 'zai', mode: 'coding-plan' as const }
  let release: (() => void) | undefined
  const first = new Promise<void>(resolve => { release = resolve })
  const calls: Array<{ url: string; signal: AbortSignal | undefined }> = []
  const reader = createTargetReader({ fetch: async (url, init) => {
    calls.push({ url, signal: init.signal })
    if (calls.length === 1) {
      await first
      return { ok: false, status: 401, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => ({ five_hour: { utilization: 0.25 } }) }
  } })
  const store = new UsageStateStore({
    clock: CLOCK, policy: () => POLICY, targets: () => [target], findSource: () => zai,
    credentials: { resolve: async () => CREDENTIAL }, read: reader,
  })
  store.start()
  const pending = store.refresh(target.key)
  await flush()
  store.stop()
  assert.equal(calls[0]?.signal?.aborted, true)
  store.start()
  const current = await store.refresh(target.key)
  assert.equal(calls[1]?.signal?.aborted, false)
  release?.()
  await pending
  assert.deepEqual(store.snapshot(target.key), current)
  assert.equal(current.error, undefined)
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.url.startsWith('https://open.bigmodel.cn/')))
  store.stop()
})

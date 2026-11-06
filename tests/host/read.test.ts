import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TIMEOUT_MS, failureKindForStatus, readUsage, type FetchLike } from '../../src/host/read.ts'
import { deepseek } from '../../src/host/sources/deepseek.ts'
import { sub2api } from '../../src/host/sources/sub2api.ts'
import { openai } from '../../src/host/sources/openai.ts'
import { SourceError } from '../../src/host/sources/types.ts'

interface Call {
  url: string
  headers: Record<string, string>
  signal: AbortSignal | undefined
}

function fetchStub(
  respond: (url: string) => { ok: boolean; status: number; body?: unknown; jsonThrows?: boolean } | Promise<never>,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, signal: init.signal })
    const result = await respond(url)
    return {
      ok: result.ok,
      status: result.status,
      json: async () => {
        if (result.jsonThrows === true) throw new SyntaxError('Unexpected token < in JSON')
        return result.body
      },
    }
  }
  return { fetch, calls }
}

const BALANCE_BODY = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '66.28' }] }

/** A minimal monitor payload for the mirror tests. */
const MONITOR_BODY = {
  success: true,
  data: {
    limits: [
      { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42 },
      { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 18 },
    ],
  },
}

test('readUsage performs the request the adapter describes and parses the payload', async () => {
  const { fetch, calls } = fetchStub(() => ({ ok: true, status: 200, body: BALANCE_BODY }))

  const reading = await readUsage({ source: deepseek, mode: 'api', apiKey: 'sk-test' }, { fetch })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, 'https://api.deepseek.com/user/balance')
  assert.equal(calls[0]?.headers.authorization, 'Bearer sk-test')
  assert.deepEqual(reading.balances, [{ amount: 66.28, currency: 'CNY' }])
})

test('readUsage applies a default timeout signal, and omits it when the timeout is disabled', async () => {
  const { fetch, calls } = fetchStub(() => ({ ok: true, status: 200, body: BALANCE_BODY }))

  await readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch })
  await readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch, timeoutMs: 0 })

  assert.ok(DEFAULT_TIMEOUT_MS > 0)
  assert.ok(calls[0]?.signal instanceof AbortSignal)
  assert.equal(calls[1]?.signal, undefined)
})

test('readUsage classifies HTTP failures so the UI can explain them', async () => {
  for (const [status, kind] of [
    [401, 'auth'],
    [403, 'auth'],
    [404, 'http'],
    [429, 'http'],
    [500, 'http'],
  ] as const) {
    const { fetch } = fetchStub(() => ({ ok: false, status }))
    await assert.rejects(
      () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
      (error: unknown) => error instanceof SourceError && error.kind === kind && error.message === `HTTP ${status}`,
      `expected HTTP ${status} to become a ${kind} failure`,
    )
  }

  assert.equal(failureKindForStatus(200), 'http')
})

test('readUsage reports a transport failure as a network problem', async () => {
  const fetch: FetchLike = async () => {
    throw new TypeError('fetch failed')
  }

  await assert.rejects(
    () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'network' && error.message === 'fetch failed',
  )
})

test('readUsage reports an aborted request as a network problem', async () => {
  const fetch: FetchLike = async () => {
    const abort = new Error('The operation was aborted due to timeout')
    abort.name = 'TimeoutError'
    throw abort
  }

  await assert.rejects(
    () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'network',
  )
})

test('readUsage reports a non-JSON body as a parse failure', async () => {
  const { fetch } = fetchStub(() => ({ ok: true, status: 200, jsonThrows: true }))

  await assert.rejects(
    () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'parse' && error.message.startsWith('invalid JSON'),
  )
})

test('readUsage reports interrupted body reads as network failures after the headers succeed', async () => {
  for (const bodyError of [
    new DOMException('The operation was aborted', 'AbortError'),
    new DOMException('The operation timed out', 'TimeoutError'),
    new TypeError('terminated'),
  ]) {
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw bodyError
      },
    })

    await assert.rejects(
      () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
      (error: unknown) => error instanceof SourceError && error.kind === 'network' && error.message === bodyError.message,
      `expected a body ${bodyError.name} to become a network failure`,
    )
  }
})

test('readUsage lets the adapter reject a payload it cannot read', async () => {
  const { fetch } = fetchStub(() => ({ ok: true, status: 200, body: { unexpected: true } }))

  await assert.rejects(
    () => readUsage({ source: deepseek, mode: 'api', apiKey: 'k' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'parse',
  )
})

test('readUsage surfaces a configuration problem without touching the network', async () => {
  const { fetch, calls } = fetchStub(() => ({ ok: true, status: 200, body: {} }))

  await assert.rejects(
    () => readUsage({ source: sub2api, mode: 'api', apiKey: 'sk-abc' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'config',
  )
  assert.equal(calls.length, 0)
})

test('readUsage falls through to a mirror endpoint when the primary rejects the key', async () => {
  const { zai } = await import('../../src/host/sources/zai.ts')
  const urls: string[] = []
  const fetch: FetchLike = async url => {
    urls.push(url)
    // The China host answers a global key with an authentication envelope.
    if (url.includes('open.bigmodel.cn')) {
      return { ok: true, status: 200, json: async () => ({ code: 1000, msg: '身份验证失败。', success: false }) }
    }
    return { ok: true, status: 200, json: async () => MONITOR_BODY }
  }

  const reading = await readUsage({ source: zai, mode: 'coding-plan', apiKey: 'k' }, { fetch })

  assert.deepEqual(urls, [
    'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
    'https://api.z.ai/api/monitor/usage/quota/limit',
  ])
  assert.deepEqual(reading.windows.map(window => window.id), ['5h', '7d'])
})

test('readUsage reports an answered failure over an unreachable one', async () => {
  const { zai } = await import('../../src/host/sources/zai.ts')
  let call = 0
  const fetch: FetchLike = async () => {
    call += 1
    if (call === 1) throw new TypeError('fetch failed')
    return { ok: true, status: 200, json: async () => ({ code: 1000, msg: 'Authentication Failed', success: false }) }
  }

  await assert.rejects(
    () => readUsage({ source: zai, mode: 'coding-plan', apiKey: 'k' }, { fetch }),
    (error: unknown) => error instanceof SourceError && error.kind === 'auth' && error.message === 'Authentication Failed',
  )
})

test('readUsage does not fall through when the user pinned the endpoint', async () => {
  const { zai } = await import('../../src/host/sources/zai.ts')
  const urls: string[] = []
  const fetch: FetchLike = async url => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => ({ code: 1000, msg: 'Authentication Failed', success: false }) }
  }

  await assert.rejects(() =>
    readUsage(
      { source: zai, mode: 'coding-plan', apiKey: 'k', baseUrl: 'https://api.z.ai', pinnedBaseUrl: true },
      { fetch },
    ),
  )
  assert.deepEqual(urls, ['https://api.z.ai/api/monitor/usage/quota/limit'])
})

test('a provider-declared endpoint is used first, with the mirror still available', async () => {
  const { zai } = await import('../../src/host/sources/zai.ts')
  const urls: string[] = []
  const fetch: FetchLike = async url => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => ({ code: 1000, msg: 'Authentication Failed', success: false }) }
  }

  await assert.rejects(() =>
    readUsage({ source: zai, mode: 'coding-plan', apiKey: 'k', baseUrl: 'https://api.z.ai' }, { fetch }),
  )
  assert.deepEqual(urls, [
    'https://api.z.ai/api/monitor/usage/quota/limit',
    'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  ])
})

const COST_MONTH = Date.UTC(2026, 10, 1)
const COST_NOW = Date.UTC(2026, 10, 6, 12, 34, 56)
const costBucket = (day: number, value: unknown) => ({
  object: 'bucket', start_time: COST_MONTH / 1000 + day * 86_400, end_time: COST_MONTH / 1000 + (day + 1) * 86_400,
  results: [{ object: 'organization.costs.result', amount: { value, currency: 'usd' } }],
})
const costPage = (data: unknown[] = [], next: string | null = null) => ({ object: 'page', data, has_more: next !== null, next_page: next })
const adminInput = { source: openai, mode: 'admin' as const, apiKey: 'fake-admin-secret' }

test('OpenAI read captures the reporting clock once across all fixed-origin, nonredirecting pages', async () => {
  let reads = 0
  const calls: Parameters<FetchLike>[] = []
  const pages = [costPage([costBucket(0, 1.25)], 'opaque+/cursor'), costPage([costBucket(5, -0.001)])]
  const fetch: FetchLike = async (url, init) => {
    calls.push([url, init])
    return { ok: true, status: 200, json: async () => pages[calls.length - 1] }
  }
  const reading = await readUsage({ ...adminInput, baseUrl: 'https://private-relay.invalid/path', pinnedBaseUrl: true }, {
    fetch, now: () => { reads += 1; return reads === 1 ? COST_NOW : Date.UTC(2026, 11, 1) },
  })
  assert.equal(reads, 1)
  assert.equal(reading.currentMonthSpend?.amount, 1.249)
  assert.equal(calls.length, 2)
  for (const [urlText, init] of calls) {
    const url = new URL(urlText)
    assert.equal(url.origin, 'https://api.openai.com')
    assert.equal(url.pathname, '/v1/organization/costs')
    assert.equal(url.searchParams.get('start_time'), String(COST_MONTH / 1000))
    assert.equal(url.searchParams.has('end_time'), false)
    assert.equal(url.searchParams.has('group_by'), false)
    assert.equal(url.searchParams.has('project_ids'), false)
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers.authorization, 'Bearer fake-admin-secret')
  }
})

test('OpenAI applies one overall deadline instead of resetting the timeout for every page', async t => {
  let clock = 10_000
  t.mock.method(Date, 'now', () => clock)
  let calls = 0
  const fetch: FetchLike = async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => {
      clock += 600
      return costPage([costBucket(calls - 1, calls)], 'later')
    } }
  }
  await assert.rejects(() => readUsage(adminInput, { fetch, now: () => COST_NOW, timeoutMs: 1_000 }),
    (error: unknown) => error instanceof SourceError && error.kind === 'network')
  assert.equal(calls, 2)
})

test('OpenAI timeout aborts a later body read and never requests another page', async () => {
  let calls = 0
  let bodyAborted = false
  let guard: ReturnType<typeof setTimeout> | undefined
  const fetch: FetchLike = async (_url, init) => {
    calls += 1
    if (calls === 1) return { ok: true, status: 200, json: async () => costPage([costBucket(0, 1)], 'later') }
    return { ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
      const aborted = () => { bodyAborted = true; reject(new Error('sensitive body aborted')) }
      if (init.signal?.aborted === true) aborted()
      else init.signal?.addEventListener('abort', aborted, { once: true })
      guard = setTimeout(() => reject(new Error('timeout signal did not abort body')), 1_000)
    }) }
  }
  try {
    await assert.rejects(() => readUsage(adminInput, { fetch, now: () => COST_NOW, timeoutMs: 20 }),
      (error: unknown) => error instanceof SourceError && error.kind === 'network')
    assert.equal(bodyAborted, true)
    assert.equal(calls, 2)
  } finally {
    clearTimeout(guard)
  }
})

test('OpenAI owner abort during headers or JSON prevents another page or publication, even if fetch ignores abort', async () => {
  for (const duringBody of [true, false]) {
    const controller = new AbortController()
    let calls = 0
    const fetch: FetchLike = async () => {
      calls += 1
      if (!duringBody) controller.abort()
      return { ok: true, status: 200, json: async () => {
        if (duringBody) controller.abort()
        return costPage([costBucket(0, 1)], 'later')
      } }
    }
    await assert.rejects(() => readUsage(adminInput, { fetch, now: () => COST_NOW, signal: controller.signal }),
      (error: unknown) => error instanceof SourceError && error.kind === 'network')
    assert.equal(calls, 1)
  }
})

test('OpenAI owner cancellation while awaiting the final body rejects a late success after an earlier valid page', async () => {
  const controller = new AbortController()
  let release: (payload: unknown) => void = () => { throw new Error('body has not started') }
  let started: () => void = () => {}
  const bodyStarted = new Promise<void>(resolve => { started = resolve })
  let calls = 0
  let bodySignal: AbortSignal | undefined
  const fetch: FetchLike = async (_url, init) => {
    calls += 1
    if (calls === 1) return { ok: true, status: 200, json: async () => costPage([costBucket(0, 12)], 'last') }
    bodySignal = init.signal
    return { ok: true, status: 200, json: () => new Promise(resolve => { release = resolve; started() }) }
  }
  const pending = readUsage(adminInput, { fetch, now: () => COST_NOW, timeoutMs: 0, signal: controller.signal })
  await bodyStarted
  controller.abort()
  release(costPage([costBucket(1, 2)]))
  await assert.rejects(pending, (error: unknown) => error instanceof SourceError && error.kind === 'network')
  assert.equal(bodySignal?.aborted, true)
  assert.equal(calls, 2)
})

test('OpenAI first-second month reads and already-aborted owners never start HTTP', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const fetch: FetchLike = async () => { calls += 1; throw new Error('must not fetch') }
  const empty = await readUsage(adminInput, { fetch, now: () => COST_MONTH + 999 })
  assert.equal(empty.currentMonthSpend?.amount, null)
  await assert.rejects(() => readUsage(adminInput, { fetch, now: () => COST_NOW, signal: controller.signal }), SourceError)
  assert.equal(calls, 0)
})

test('OpenAI later-page HTTP, transport, JSON and amount failures remain atomic and sanitized without fallback', async () => {
  const secret = 'fake-admin-secret https://private.invalid/?cursor=secret raw-payload'
  for (const failure of ['401', '403', '429', '302', 'transport', 'json', 'amount'] as const) {
    let calls = 0
    const fetch: FetchLike = async () => {
      calls += 1
      if (calls === 1) return { ok: true, status: 200, json: async () => costPage([costBucket(0, 12)], 'secret-cursor') }
      if (failure === 'transport') throw new Error(secret)
      if (failure === 'json') return { ok: true, status: 200, json: async () => { throw new SyntaxError(secret) } }
      if (failure === 'amount') return { ok: true, status: 200, json: async () => costPage([costBucket(1, null)]) }
      return { ok: false, status: Number(failure), json: async () => ({ error: secret }) }
    }
    const expected = failure === '401' || failure === '403' ? 'auth'
      : failure === 'json' || failure === 'amount' ? 'parse' : failure === 'transport' ? 'network' : 'http'
    await assert.rejects(() => readUsage(adminInput, { fetch, now: () => COST_NOW }),
      (error: unknown) => error instanceof SourceError && error.kind === expected
        && !/fake-admin-secret|private|cursor|raw-payload/.test(error.message))
    assert.equal(calls, 2)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { openai, readOpenAICosts } from '../../src/host/sources/openai.ts'
import { SourceError, type RequestInput, type UsageRequest } from '../../src/host/sources/types.ts'

const MONTH = Date.UTC(2026, 10, 1)
const NOW = Date.UTC(2026, 10, 6, 9, 22, 15, 789)
const END = Date.UTC(2026, 11, 1)
const DAY = 86_400
const INPUT: RequestInput = { mode: 'admin', apiKey: 'fake-admin-secret', now: NOW }
const row = (value: unknown, currency: unknown = 'usd') => ({ object: 'organization.costs.result', amount: { value, currency } })
const bucket = (day: number, results: unknown[] = [row(1)]) => ({ object: 'bucket', start_time: MONTH / 1000 + day * DAY, end_time: MONTH / 1000 + (day + 1) * DAY, results })
const page = (data: unknown[] = [], next: string | null = null) => ({ object: 'page', data, has_more: next !== null, next_page: next })
const parse = (data: unknown[]) => openai.parse(page(data), 'admin', INPUT)
const isParse = (error: unknown) => error instanceof SourceError && error.kind === 'parse'

test('OpenAI admin source has no default credential and only targets official HTTPS without redirects', () => {
  assert.deepEqual(openai.modes, ['admin'])
  assert.deepEqual(openai.credentialRefs('admin'), [])
  assert.equal(openai.defaultBaseUrl('admin'), 'https://api.openai.com')
  assert.equal(openai.fallbackRequests, undefined)
  const request = openai.request({ ...INPUT, baseUrl: 'http://relay.invalid/proxy', pinnedBaseUrl: true })
  const url = new URL(request.url)
  assert.equal(url.origin, 'https://api.openai.com')
  assert.equal(url.pathname, '/v1/organization/costs')
  assert.deepEqual([...url.searchParams.keys()].sort(), ['bucket_width', 'limit', 'start_time'])
  assert.equal(url.searchParams.get('start_time'), String(MONTH / 1000))
  assert.equal(url.searchParams.has('end_time'), false)
  assert.equal(url.searchParams.get('bucket_width'), '1d')
  assert.equal(request.redirect, 'error')
  assert.equal(request.headers.authorization, 'Bearer fake-admin-secret')
})

test('captured Costs responses retain today when no current-second cutoff is sent', async () => {
  // User-controlled curl comparison: adding only end_time=now removed today's bucket.
  // These are sanitized observations, not a general model of server-side filtering.
  const withoutEnd = page([bucket(4, []), bucket(5, [row(50.174514)])])
  const withCurrentSecondEnd = page([bucket(4, [])])
  const requests: URL[] = []
  const reading = await readOpenAICosts(INPUT, async request => {
    const url = new URL(request.url)
    requests.push(url)
    const end = url.searchParams.get('end_time')
    assert.ok(end === null || end === String(Math.floor(NOW / 1000)))
    return end === null ? withoutEnd : withCurrentSecondEnd
  })
  assert.equal(reading.currentMonthSpend?.amount, 50.174514)
  assert.equal(reading.currentMonthSpend?.monthStart, MONTH)
  assert.equal(reading.currentMonthSpend?.monthEnd, END)
  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.searchParams.get('start_time'), String(MONTH / 1000))
  assert.equal(requests[0]?.searchParams.has('end_time'), false)
})

test('request and parse require an injected valid reporting instant and admin mode', () => {
  for (const now of [undefined, null, Number.NaN, Infinity, -1, Number.MAX_VALUE]) {
    const input = { ...INPUT, now } as RequestInput
    for (const operation of [() => openai.request(input), () => openai.parse(page(), 'admin', input)]) {
      assert.throws(operation, (error: unknown) => error instanceof SourceError && error.kind === 'config')
    }
  }
  assert.throws(() => openai.parse(page(), 'admin'), SourceError)
  for (const mode of ['api', 'account', 'coding-plan'] as const) {
    assert.throws(() => openai.request({ ...INPUT, mode }), SourceError)
    assert.throws(() => openai.parse(page(), mode, INPUT), SourceError)
  }
})

test('request and parse never consult the ambient clock', t => {
  t.mock.method(Date, 'now', () => { throw new Error('ambient clock must not be read') })
  assert.ok(openai.request(INPUT).url.includes('/v1/organization/costs'))
  assert.equal(openai.parse(page(), 'admin', INPUT).currentMonthSpend?.amount, null)
})

test('organization spend retains signed and subcent USD amounts, not balances or windows', () => {
  const reading = parse([bucket(0, [row(0.0000123), row(-0.25, 'USD')]), bucket(1, [row(2.5)])])
  assert.deepEqual(reading, {
    balances: [], windows: [],
    currentMonthSpend: { amount: 0.0000123 - 0.25 + 2.5, currency: 'USD', scope: 'organization', monthStart: MONTH, monthEnd: END },
  })
  assert.equal(parse([bucket(0, [row(5), row(-5)])]).currentMonthSpend?.amount, 0)
})

test('complete empty costs stay null while explicit numeric zero stays zero', () => {
  assert.equal(parse([]).currentMonthSpend?.amount, null)
  assert.equal(parse([bucket(0, [])]).currentMonthSpend?.amount, null)
  assert.equal(parse([bucket(0, [row(0)])]).currentMonthSpend?.amount, 0)
})

test('period boundaries use UTC natural months including leap years, year changes and offset instants', () => {
  for (const [now, start, end] of [
    [Date.UTC(2024, 1, 29, 23), Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1)],
    [Date.UTC(2026, 11, 31, 23), Date.UTC(2026, 11, 1), Date.UTC(2027, 0, 1)],
    [Date.parse('2026-12-01T00:30:00+08:00'), Date.UTC(2026, 10, 1), Date.UTC(2026, 11, 1)],
  ]) {
    const reading = openai.parse(page(), 'admin', { ...INPUT, now: now! })
    assert.equal(reading.currentMonthSpend?.monthStart, start)
    assert.equal(reading.currentMonthSpend?.monthEnd, end)
  }
})

test('today may end at the next midnight or the captured partial-day end, never after the month', () => {
  assert.equal(parse([bucket(5)]).currentMonthSpend?.amount, 1)
  assert.equal(parse([{ ...bucket(5), end_time: Math.floor(NOW / 1000) }]).currentMonthSpend?.amount, 1)
  const now = END - 1
  const lastDay = bucket(29)
  assert.equal(openai.parse(page([lastDay]), 'admin', { ...INPUT, now }).currentMonthSpend?.amount, 1)
})

test('malformed envelopes, bucket intervals and row discriminators fail the whole reading', () => {
  const good = bucket(0)
  const invalid = [
    null, [], {}, { ...page(), object: 'list' }, { ...page(), data: {} }, { ...page(), has_more: 0 },
    { ...page(), next_page: 'unexpected' }, { ...page(), next_page: undefined }, page([], 'unfinished'),
    page([null]), page([{ ...good, object: 'costs' }]), page([{ ...good, start_time: '1' }]),
    page([{ ...good, start_time: good.start_time + 1 }]), page([{ ...good, end_time: good.end_time - 1 }]),
    page([{ ...good, end_time: good.start_time }]), page([{ ...good, end_time: Infinity }]),
    page([bucket(-1)]), page([bucket(6)]), page([{ ...bucket(5), end_time: END / 1000 + DAY }]),
    page([{ ...good, results: null }]), page([bucket(0, [null])]),
    page([bucket(0, [{ ...row(1), object: 'organization.usage.completions.result' }])]),
    page([bucket(0, [{ object: 'organization.costs.result' }])]),
    page([bucket(0, [{ object: 'organization.costs.result', amount: null }])]),
    page([good, good]), page([bucket(5), { ...bucket(5), end_time: Math.floor(NOW / 1000) }]),
  ]
  for (const payload of invalid) assert.throws(() => openai.parse(payload, 'admin', INPUT), isParse)
})

test('missing, null, nonnumeric, nonfinite, non-USD and overflowing amounts never become zero', () => {
  for (const value of [undefined, null, '', '0', '1.25', NaN, Infinity, -Infinity, false, {}]) {
    assert.throws(() => parse([bucket(0, [row(1), row(value)])]), isParse)
  }
  for (const currency of [undefined, null, '', 'CNY', 'eur', 'uSd', 1]) {
    assert.throws(() => parse([bucket(0, [{ ...row(1), amount: { value: 1, currency } }])]), isParse)
  }
  assert.throws(() => parse([bucket(0, [row(Number.MAX_VALUE), row(Number.MAX_VALUE)])]), isParse)
})

test('all pages share captured start and no explicit cutoff, keep opaque cursors encoded and permit empty intermediate pages', async () => {
  const requests: UsageRequest[] = []
  const cursor = 'opaque +&?=/秘密'
  const pages = [page([bucket(0, [row(1.25)])], cursor), page([], 'last'), page([bucket(5, [row(-0.125)])])]
  const reading = await readOpenAICosts(INPUT, async request => {
    requests.push(request)
    return pages[requests.length - 1]
  })
  assert.equal(reading.currentMonthSpend?.amount, 1.125)
  assert.equal(requests.length, 3)
  for (const request of requests) {
    const url = new URL(request.url)
    assert.equal(url.origin, 'https://api.openai.com')
    assert.equal(url.searchParams.get('start_time'), String(MONTH / 1000))
    assert.equal(url.searchParams.has('end_time'), false)
    assert.equal(url.searchParams.has('group_by'), false)
    assert.equal(url.searchParams.has('project_ids'), false)
    assert.equal(request.redirect, 'error')
  }
  assert.equal(new URL(requests[1]!.url).searchParams.get('page'), cursor)
})

test('invalid later pages, duplicate daily buckets and cursor cycles fail atomically without another page', async () => {
  for (const pages of [
    [page([bucket(0)], 'second'), page([bucket(1, [row(null)])], 'third')],
    [page([bucket(0)], 'second'), page([bucket(0)], 'third')],
    [page([bucket(0, [row(Number.MAX_VALUE)])], 'second'), page([bucket(1, [row(Number.MAX_VALUE)])])],
    [page([], 'same'), page([], 'same')],
    [page([], 'a'), page([], 'b'), page([], 'a')],
    [{ ...page(), has_more: true, next_page: null }],
    [{ ...page(), has_more: true, next_page: '' }],
  ]) {
    let count = 0
    await assert.rejects(() => readOpenAICosts(INPUT, async () => pages[count++]), isParse)
    assert.equal(count, pages.length)
  }
  await assert.rejects(() => readOpenAICosts(INPUT, async () => page([bucket(0, [row(1)])], 'forever')), isParse)
})

test('server-default end never admits a future UTC day or next month across pages', async () => {
  for (const now of [NOW, END - 1]) {
    const nextDay = Math.floor(now / 1000 / DAY) - MONTH / 1000 / DAY + 1
    const pages = [page([bucket(0)], 'later'), page([bucket(nextDay)])]
    let count = 0
    await assert.rejects(() => readOpenAICosts({ ...INPUT, now }, async request => {
      assert.equal(new URL(request.url).searchParams.has('end_time'), false)
      return pages[count++]
    }), isParse)
    assert.equal(count, 2)
  }
})

test('unbounded distinct cursors stop after 64 pages, including empty pages', async () => {
  let count = 0
  await assert.rejects(() => readOpenAICosts(INPUT, async () => page([], String(++count))), isParse)
  assert.equal(count, 64)
})

test('exact month start, including its first partial second, returns null without zero-width HTTP', async () => {
  for (const now of [MONTH, MONTH + 999]) {
    let count = 0
    const result = await readOpenAICosts({ ...INPUT, now }, async () => { count += 1; return page() })
    assert.equal(count, 0)
    assert.equal(result.currentMonthSpend?.amount, null)
    assert.equal(result.currentMonthSpend?.monthEnd, END)
  }
})

test('owner cancellation before and during pagination prevents later pages and a completed reading', async () => {
  for (const before of [true, false]) {
    const controller = new AbortController()
    if (before) controller.abort()
    let count = 0
    await assert.rejects(() => readOpenAICosts(INPUT, async () => {
      count += 1
      controller.abort()
      return page([bucket(0)], 'later')
    }, controller.signal), (error: unknown) => error instanceof SourceError && error.kind === 'network')
    assert.equal(count, before ? 0 : 1)
  }
})

test('transport failures expose neither admin keys, URLs nor opaque cursor/payload details', async () => {
  await assert.rejects(() => readOpenAICosts(INPUT, async () => {
    throw new SourceError('http', 'fake-admin-secret https://private.invalid/costs?cursor=sensitive raw-payload')
  }), (error: unknown) => error instanceof SourceError && error.kind === 'http'
    && !/fake-admin-secret|private|sensitive|raw-payload/.test(error.message))
})

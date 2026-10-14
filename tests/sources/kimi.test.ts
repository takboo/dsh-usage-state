import test from 'node:test'
import assert from 'node:assert/strict'

import { kimi } from '../../src/host/sources/kimi.ts'
import { SourceError } from '../../src/host/sources/types.ts'

const FIVE_H_RESET = '2026-09-20T16:00:00.000Z'
const WEEK_RESET = '2026-09-27T00:00:00.000Z'

test('kimi serves both modes with different endpoints and credentials', () => {
  assert.deepEqual([...kimi.modes], ['api', 'coding-plan'])
  assert.equal(kimi.defaultBaseUrl('api'), 'https://api.moonshot.cn')
  assert.equal(kimi.defaultBaseUrl('coding-plan'), 'https://api.kimi.com')
  assert.ok(kimi.credentialRefs('coding-plan').includes('KIMI_CODING_API_KEY'))
  assert.ok(kimi.credentialRefs('api').includes('MOONSHOT_API_KEY'))
  assert.ok(!kimi.credentialRefs('api').includes('KIMI_CODING_API_KEY'))
})

test('kimi reads the Moonshot pay-as-you-go balance in API mode', () => {
  const request = kimi.request({ mode: 'api', apiKey: 'sk-moonshot' })

  assert.equal(request.url, 'https://api.moonshot.cn/v1/users/me/balance')
  assert.equal(request.headers.authorization, 'Bearer sk-moonshot')
})

test('kimi reads the Kimi Code subscription windows in coding-plan mode, with the CLI user agent', () => {
  const request = kimi.request({ mode: 'coding-plan', apiKey: 'sk-kimi' })

  assert.equal(request.url, 'https://api.kimi.com/coding/v1/usages')
  assert.equal(request.headers.authorization, 'Bearer sk-kimi')
  assert.equal(request.headers['user-agent'], 'KimiCLI/1.6')
})

test('kimi parses the weekly window from the top-level usage and the 5h window from limits[]', () => {
  const reading = kimi.parse(
    {
      usage: { used: 30, limit: 100, remaining: 70, resetTime: WEEK_RESET },
      limits: [
        { window: { duration: 5, timeUnit: 'hour' }, detail: { used: 12, limit: 60, remaining: 48, resetTime: FIVE_H_RESET } },
      ],
    },
    'coding-plan',
  )

  assert.deepEqual(reading.windows, [
    { id: '5h', usedPercent: 20, resetsAt: Date.parse(FIVE_H_RESET) },
    { id: '7d', usedPercent: 30, resetsAt: Date.parse(WEEK_RESET) },
  ])
  assert.deepEqual(reading.balances, [])
})

test('kimi derives the percentage from remaining when used is absent', () => {
  const reading = kimi.parse(
    { usage: { limit: 200, remaining: 150 }, limits: [{ window: { duration: 5, timeUnit: 'hour' }, detail: { limit: 40, remaining: 30 } }] },
    'coding-plan',
  )

  assert.deepEqual(reading.windows, [
    { id: '5h', usedPercent: 25 },
    { id: '7d', usedPercent: 25 },
  ])
})

test('kimi ignores limit rows without a usable detail window', () => {
  const reading = kimi.parse(
    { usage: { used: 1, limit: 4 }, limits: [{ window: { duration: 5, timeUnit: 'hour' } }, null, 'x'] },
    'coding-plan',
  )

  assert.deepEqual(reading.windows, [{ id: '7d', usedPercent: 25 }])
})

test('kimi reads the official Moonshot balance in yuan at every amount', () => {
  // The official /v1/users/me/balance contract defines available_balance in yuan.
  for (const [amount, expected] of [
    [99.99, 99.99],
    [100, 100],
    [100.01, 100.01],
    [6628, 6628],
    [0, 0],
  ] as const) {
    const reading = kimi.parse(
      { code: 0, data: { available_balance: amount, voucher_balance: 0, cash_balance: amount }, scode: '0x0', status: true },
      'api',
    )

    assert.deepEqual(reading.balances, [{ amount: expected, currency: 'CNY' }])
  }
})

test('kimi accepts legacy Moonshot balance fields without changing the yuan unit', () => {
  for (const [payload, expected] of [
    [{ available_balance: 6628 }, 6628],
    [{ available_balance: 66.28 }, 66.28],
    [{ data: { available_balance: '1200' } }, 1200],
    [{ balance: 350 }, 350],
  ] as const) {
    assert.deepEqual(kimi.parse(payload, 'api').balances, [{ amount: expected, currency: 'CNY' }])
  }
})

test('kimi rejects payloads it cannot read in either mode', () => {
  for (const payload of [{}, { usage: {} }, null, 'nope']) {
    assert.throws(
      () => kimi.parse(payload, 'coding-plan'),
      (error: unknown) => error instanceof SourceError && error.kind === 'parse',
      `expected a coding-plan parse failure for ${JSON.stringify(payload)}`,
    )
  }
  for (const payload of [
    {},
    { available_balance: 'nope' },
    { available_balance: -1 },
    null,
    ...[undefined, null, '', ' ', 'nope', Number.NaN, Number.POSITIVE_INFINITY, true, {}].map(value => ({
      code: 0,
      data: { available_balance: value, voucher_balance: 0, cash_balance: 0 },
      scode: '0x0',
      status: true,
    })),
  ]) {
    assert.throws(
      () => kimi.parse(payload, 'api'),
      (error: unknown) => error instanceof SourceError && error.kind === 'parse',
      `expected an api parse failure for ${JSON.stringify(payload)}`,
    )
  }
})


test('Kimi accepts origin and full coding API bases without duplicating the path', () => {
  for (const baseUrl of ['https://api.kimi.ai', 'https://api.kimi.ai/coding', 'https://api.kimi.ai/coding/v1/']) {
    assert.equal(kimi.request({ mode: 'coding-plan', apiKey: 'test', baseUrl }).url, 'https://api.kimi.ai/coding/v1/usages')
  }
  assert.equal(kimi.request({ mode: 'api', apiKey: 'test', baseUrl: 'https://api.moonshot.ai/v1/' }).url, 'https://api.moonshot.ai/v1/users/me/balance')
})

test('Kimi reads official-client ratio pools and prefers them to legacy counters', () => {
  const reading = kimi.parse({
    usages: {
      limit_5h: { used_ratio: '0.01', reset_time: FIVE_H_RESET },
      limit_7d: { used_ratio: 0, reset_time: WEEK_RESET },
      limit_month_total: { used_ratio: 1 },
      limit_month_code: { used_ratio: 0.25 },
    },
    usage: { limit: 100, used: 80 },
    limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: 100, used: 99 } }],
  }, 'coding-plan')
  assert.deepEqual(reading, { balances: [], windows: [
    { id: '5h', usedPercent: 1, resetsAt: Date.parse(FIVE_H_RESET) },
    { id: '7d', usedPercent: 0, resetsAt: Date.parse(WEEK_RESET) },
    { id: 'month', usedPercent: 100 },
    { id: 'month-code', usedPercent: 25 },
  ] })
})

test('Kimi supports new plans without inventing a weekly quota and clamps overage', () => {
  assert.deepEqual(kimi.parse({ usages: {
    limit_5h: { used_ratio: 1.2, reset_time: 'invalid' },
    limit_month_total: { used_ratio: 0 },
  } }, 'coding-plan').windows, [
    { id: '5h', usedPercent: 100 }, { id: 'month', usedPercent: 0 },
  ])
})

test('Kimi canonicalizes legacy enum minute/hour/week windows', () => {
  for (const window of [
    { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, { duration: 5, timeUnit: 'TIME_UNIT_HOUR' },
  ]) {
    assert.deepEqual(kimi.parse({ limits: [{ window, detail: { limit: '100', remaining: '25', resetTime: '1790000000' } }] }, 'coding-plan').windows,
      [{ id: '5h', usedPercent: 75, resetsAt: 1790000000000 }])
  }
  assert.deepEqual(kimi.parse({ limits: [{ window: { duration: 1, timeUnit: 'TIME_UNIT_WEEK' }, detail: { limit: 100, used: 20 } }] }, 'coding-plan').windows,
    [{ id: '7d', usedPercent: 20 }])
})

test('Kimi never turns a finite extreme overage into zero through overflow', () => {
  assert.deepEqual(kimi.parse({ usages: { limit_5h: { used_ratio: 1e308 } } }, 'coding-plan').windows, [{ id: '5h', usedPercent: 100 }])
  assert.deepEqual(kimi.parse({ usage: { used: 1e308, limit: 1e-300 } }, 'coding-plan').windows, [{ id: '7d', usedPercent: 100 }])
})

test('Kimi rejects malformed quota values and HTTP-200 error envelopes', () => {
  for (const value of [undefined, null, '', ' ', 'bad', true, {}, -1, Infinity, NaN]) {
    assert.throws(() => kimi.parse({ usages: { limit_5h: { used_ratio: value } } }, 'coding-plan'), SourceError)
  }
  for (const error of [{ error: { message: 'denied' } }, { code: 401 }, { status: false }]) {
    assert.throws(() => kimi.parse({ ...error, usages: { limit_5h: { used_ratio: 0 } } }, 'coding-plan'), SourceError)
    assert.throws(() => kimi.parse({ ...error, data: { available_balance: 100 } }, 'api'), SourceError)
  }
})

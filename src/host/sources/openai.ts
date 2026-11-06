import { utcMonthStart } from '../../shared/period.ts'
import type { UsageMode, UsageReading } from '../../shared/types.ts'
import { SourceError, type RequestInput, type UsageRequest, type UsageSource } from './types.ts'

const BASE_URL = 'https://api.openai.com'
const DAY = 86_400
const MAX_PAGES = 64

interface Period {
  monthStart: number
  monthEnd: number
  start: number
  end: number
}

interface CostsPage {
  data: unknown[]
  has_more: boolean
  next_page: string | null
}

function period(input: RequestInput | undefined): Period {
  const now = input?.now
  if (input?.mode !== 'admin' || typeof now !== 'number' || !Number.isFinite(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) {
    throw new SourceError('config', 'OpenAI organization costs require admin mode and a reporting instant')
  }
  const monthStart = utcMonthStart(now)
  const date = new Date(monthStart)
  const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  if (!Number.isFinite(monthEnd)) throw new SourceError('config', 'Invalid OpenAI reporting month')
  return { monthStart, monthEnd, start: monthStart / 1000, end: Math.floor(now / 1000) }
}

function invalid(): never {
  throw new SourceError('parse', 'Invalid OpenAI organization costs response')
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

/** Daily buckets may end at the captured instant or the next UTC midnight. */
function amountOf(data: unknown[], range: Period, seen: Set<number>): number | null {
  let total = 0
  let count = 0
  for (const raw of data) {
    const bucket = object(raw)
    const start = bucket.start_time
    const end = bucket.end_time
    if (bucket.object !== 'bucket' || typeof start !== 'number' || typeof end !== 'number'
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start % DAY !== 0
      || start < range.start || start >= range.end || end <= start || end > start + DAY
      || (end !== start + DAY && end !== range.end) || end > range.monthEnd / 1000
      || seen.has(start) || !Array.isArray(bucket.results)) invalid()
    // UTC-aligned daily starts and at most one day per bucket make this an overlap guard too.
    seen.add(start)
    for (const rawRow of bucket.results) {
      const row = object(rawRow)
      if (row.object !== 'organization.costs.result') invalid()
      const amount = object(row.amount)
      if (typeof amount.value !== 'number' || !Number.isFinite(amount.value)
        || (amount.currency !== 'USD' && amount.currency !== 'usd')) invalid()
      total += amount.value
      count += 1
      if (!Number.isFinite(total)) invalid()
    }
  }
  return count === 0 ? null : total
}

function page(payload: unknown): CostsPage {
  const root = object(payload)
  if (root.object !== 'page' || !Array.isArray(root.data) || typeof root.has_more !== 'boolean') invalid()
  const next = root.next_page
  if (root.has_more ? typeof next !== 'string' || next.length === 0 : next !== null) invalid()
  return { data: root.data, has_more: root.has_more, next_page: next as string | null }
}

export const openai: UsageSource = {
  id: 'openai',
  displayName: 'OpenAI',
  modes: ['admin'],
  credentialRefs: () => [],
  defaultBaseUrl: () => BASE_URL,

  request(input: RequestInput): UsageRequest {
    const range = period(input)
    if (range.end <= range.start) throw new SourceError('config', 'OpenAI reporting interval is empty')
    const url = new URL('/v1/organization/costs', BASE_URL)
    url.searchParams.set('start_time', String(range.start))
    // Costs uses daily buckets: an explicit current-second cutoff can omit today's costs.
    // Leave end_time unset, then validate every returned bucket against the captured range.
    url.searchParams.set('bucket_width', '1d')
    url.searchParams.set('limit', '31')
    return { url: url.href, headers: { authorization: `Bearer ${input.apiKey}`, accept: 'application/json' }, redirect: 'error' }
  },

  parse(payload: unknown, mode: UsageMode, input?: RequestInput): UsageReading {
    if (mode !== 'admin') throw new SourceError('config', 'OpenAI organization costs require admin mode')
    const range = period(input)
    const complete = page(payload)
    if (complete.has_more) invalid()
    return {
      balances: [],
      windows: [],
      currentMonthSpend: {
        amount: amountOf(complete.data, range, new Set()), currency: 'USD', scope: 'organization',
        monthStart: range.monthStart, monthEnd: range.monthEnd,
      },
    }
  },
}

function active(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new SourceError('network', 'OpenAI organization costs request aborted')
}

/** One bounded, atomic organization-costs read; no generic pagination protocol. */
export async function readOpenAICosts(
  input: RequestInput,
  fetchPage: (request: UsageRequest) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<UsageReading> {
  try {
    active(signal)
    const captured = { ...input }
    const range = period(captured)
    const complete = { object: 'page', data: [] as unknown[], has_more: false, next_page: null }
    if (range.end > range.start) {
      const first = openai.request(captured)
      const cursors = new Set<string>()
      const buckets = new Set<number>()
      let request = first
      for (let index = 0; ; index += 1) {
        active(signal)
        const payload = await fetchPage(request)
        active(signal)
        const current = page(payload)
        amountOf(current.data, range, buckets)
        complete.data.push(...current.data)
        if (!current.has_more) break
        const cursor = current.next_page as string
        if (index + 1 >= MAX_PAGES || cursors.has(cursor)) invalid()
        cursors.add(cursor)
        const url = new URL(first.url)
        url.searchParams.set('page', cursor)
        request = { ...first, url: url.href }
      }
    }
    active(signal)
    const reading = openai.parse(complete, 'admin', captured)
    active(signal)
    return reading
  } catch (error) {
    throw new SourceError(error instanceof SourceError ? error.kind : 'network', 'OpenAI organization costs request failed')
  }
}

import type { UsageMode, UsageReading } from '../../shared/types.ts'
import { normalizeBaseUrl, toFiniteNumber } from './normalize.ts'
import { SourceError, type RequestInput, type UsageRequest, type UsageSource } from './types.ts'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const BALANCE_PATH = '/user/balance'

interface PickedBalance {
  amount: number
  currency: string
  granted?: number
  toppedUp?: number
}

/**
 * DeepSeek returns one entry per currency and the order is not stable, so a
 * fixed "first entry" read makes the displayed balance flip between the real
 * value and zero. Rule: prefer an entry with a positive balance, prefer CNY
 * among equals (the open platform's primary currency), and fall back to CNY or
 * the first entry so the result never depends on response ordering.
 */
function pickBalanceInfo(infos: unknown): PickedBalance | undefined {
  if (!Array.isArray(infos)) return undefined

  const entries: PickedBalance[] = []
  for (const raw of infos) {
    if (raw === null || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const amount = toFiniteNumber(entry.total_balance)
    if (amount === undefined) continue
    const granted = toFiniteNumber(entry.granted_balance)
    const toppedUp = toFiniteNumber(entry.topped_up_balance)
    entries.push({
      amount,
      currency: typeof entry.currency === 'string' ? entry.currency : '',
      ...(granted === undefined ? {} : { granted }),
      ...(toppedUp === undefined ? {} : { toppedUp }),
    })
  }
  if (entries.length === 0) return undefined

  const cnyOf = (list: PickedBalance[]): PickedBalance | undefined =>
    list.find(entry => entry.currency.toUpperCase() === 'CNY')

  const funded = entries.filter(entry => entry.amount > 0)
  return cnyOf(funded) ?? funded[0] ?? cnyOf(entries) ?? entries[0]
}

/** DeepSeek balances: API keys and Harness account grants are separate identities. */
export const deepseek: UsageSource = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  modes: ['api', 'account'],
  credentialRefs: mode => mode === 'account' ? [] : ['DEEPSEEK_API_KEY'],
  defaultBaseUrl: mode => mode === 'account' ? 'https://platform.deepseek.com' : DEFAULT_BASE_URL,

  request(input: RequestInput): UsageRequest {
    if (input.mode === 'account') throw new SourceError('config', 'Account balance requires the Harness account service')
    const base = normalizeBaseUrl(input.baseUrl) ?? DEFAULT_BASE_URL
    return {
      url: `${base}${BALANCE_PATH}`,
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: 'application/json',
      },
    }
  },

  parse(payload: unknown, mode: UsageMode): UsageReading {
    if (mode === 'account') return parseAccountBalance(payload)
    const root = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined
    const picked = root === undefined ? undefined : pickBalanceInfo(root.balance_infos)
    if (picked === undefined) {
      throw new SourceError('parse', 'DeepSeek balance response contains no usable balance_infos')
    }
    return {
      balances: [
        {
          amount: picked.amount,
          currency: picked.currency,
          ...(picked.granted === undefined ? {} : { granted: picked.granted }),
          ...(picked.toppedUp === undefined ? {} : { toppedUp: picked.toppedUp }),
        },
      ],
      windows: [],
    }
  },
}

/** Parse the account service's sanitized normal and bonus wallets (major units). */
export function parseAccountBalance(payload: unknown): UsageReading {
  const root = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
  if (root?.status === 'failed') throw new SourceError('http', 'Harness account balance is temporarily unavailable')
  if (root?.status !== 'ready' || !Array.isArray(root.value) || !Array.isArray(root.bonusWallets)) {
    throw new SourceError('parse', 'Invalid Harness account balance response')
  }
  const wallets = new Map<string, { toppedUp: number; granted: number }>()
  for (const [rows, field] of [[root.value, 'toppedUp'], [root.bonusWallets, 'granted']] as const) {
    for (const raw of rows) {
      const row = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : undefined
      const amount = toFiniteNumber(row?.balance)
      const currency = row?.currency
      if (amount === undefined || (currency !== 'CNY' && currency !== 'USD')) {
        throw new SourceError('parse', 'Invalid Harness account wallet')
      }
      const wallet = wallets.get(currency) ?? { toppedUp: 0, granted: 0 }
      wallet[field] += amount
      if (!Number.isFinite(wallet[field])) throw new SourceError('parse', 'Invalid Harness account wallet total')
      wallets.set(currency, wallet)
    }
  }
  const picked = pickBalanceInfo([...wallets].map(([currency, wallet]) => ({
    currency, total_balance: wallet.toppedUp + wallet.granted,
    granted_balance: wallet.granted, topped_up_balance: wallet.toppedUp,
  })))
  if (picked === undefined) throw new SourceError('parse', 'Harness account has no usable wallets')
  return { balances: [picked], windows: [] }
}

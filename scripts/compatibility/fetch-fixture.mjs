// Test host only: deterministic data and no inherited account credentials.
// This intercepts fetch, not every network API; it is not an egress boundary.
import { appendFileSync } from 'node:fs'

const original = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return original(input, init)
  const models = url.hostname === 'api.deepseek.com' && url.pathname === '/models'
  const balance = url.hostname === 'api.deepseek.com' && url.pathname === '/user/balance'
  if (models || balance) {
    const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
    const credential = models ? headers.get('x-api-key') : headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const source = credential === 'compat-file-key' ? 'file' : credential === 'compat-env-key' ? 'environment' : 'unknown'
    if (process.env.DSH_FIXTURE_TRACE) appendFileSync(process.env.DSH_FIXTURE_TRACE, JSON.stringify({ endpoint: models ? 'models' : 'balance', source }) + '\n')
    if (source !== 'file') return json({ error: 'fixture expected the saved credential' }, 403)
    if (models) return json({ object: 'list', data: [
      { id: 'deepseek-flash', name: 'Compatibility Flash', api_capabilities: { anthropic_messages: {} } },
      { id: 'deepseek-v4-pro', name: 'Compatibility Pro', api_capabilities: { anthropic_messages: {} } },
    ] })
    return json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '42.25', granted_balance: '0', topped_up_balance: '42.25' }] })
  }
  throw new Error(`Blocked external fetch: ${url.origin}`)
}

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

import type { CredentialDescription } from '../shared/rpc.ts'
import type { ResolvedTargetCredential } from './refresh.ts'
import { parseAccountBalance } from './sources/deepseek.ts'
import { SourceError } from './sources/types.ts'

interface AccountClientMetadata {
  version: string
  locale: string
  timezoneOffsetSeconds: number
}

/** Host-only service contract, verified against the bundled Desktop account provider. */
export interface DeepSeekAccountLike {
  getPlatformSession(): Promise<{ origin: string; token: string } | null>
  getBalance(client: AccountClientMetadata): Promise<unknown>
}

function clientMetadata(): AccountClientMetadata {
  // APP_IDENTITY uses this package version too. Read metadata without loading the LLM runtime.
  let version = ''
  try { version = createRequire(import.meta.url)('@deepseek-ai/dsh-llm/package.json').version } catch { /* optional on older hosts */ }
  return {
    version,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

/** Do not export the grant or its digest across the plugin RPC boundary. */
export async function resolveAccountCredential(account: DeepSeekAccountLike | undefined): Promise<ResolvedTargetCredential | undefined> {
  if (typeof account?.getPlatformSession !== 'function' || typeof account.getBalance !== 'function') return undefined
  try {
    const session = await account.getPlatformSession()
    if (session === null || typeof session.token !== 'string' || session.token.trim() === '') return undefined
    return {
      apiKey: '', ref: 'deepseek-account', origin: 'account',
      identity: createHash('sha256').update(JSON.stringify([session.origin, session.token])).digest('hex'),
    }
  } catch {
    // A grant storage failure must clear any previously displayed account identity.
    return undefined
  }
}

export async function describeAccount(account: DeepSeekAccountLike | undefined): Promise<CredentialDescription> {
  return { candidates: [], configured: (await resolveAccountCredential(account)) !== undefined, source: 'account', writable: false }
}

/** The host service owns authorization, destination validation, timeouts and grant expiry. */
export async function readAccountBalance(
  account: DeepSeekAccountLike | undefined,
  credential: ResolvedTargetCredential,
  invalidate: () => void,
) {
  const matches = async () => (await resolveAccountCredential(account))?.identity === credential.identity
  if (account === undefined || !await matches()) {
    invalidate()
    throw new SourceError('config', 'DeepSeek account changed; sign in through Harness account settings')
  }
  let payload: unknown
  try {
    payload = await account.getBalance(clientMetadata())
  } catch {
    // Do not forward arbitrary host errors: they may contain an account grant.
    if (!await matches()) invalidate()
    throw new SourceError('http', 'Harness account balance is temporarily unavailable')
  }
  if (!await matches()) {
    invalidate()
    throw new SourceError('config', 'DeepSeek account changed; sign in through Harness account settings')
  }
  if (payload === null) throw new SourceError('auth', 'DeepSeek account balance requires a valid Harness login')
  return parseAccountBalance(payload)
}

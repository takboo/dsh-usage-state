import { DEFAULT_CONFIG, type UsageStateConfig } from '../shared/config.ts'
import { originOf, resolveProvider } from '../shared/providers.ts'
import type { UsageMode } from '../shared/types.ts'
import { toSourceCatalog } from './catalog.ts'

const CATALOG = toSourceCatalog()

/**
 * Inputs for deriving credential refs from the DSH provider configuration.
 * Both namespaces are read as `unknown` because they belong to other plugins.
 */
export interface ProviderCredentialRefsInput {
  sourceId: string
  /** Target owner. Omitting it never searches unrelated provider profiles. */
  provider?: string
  /** Effective request origin; a changed origin needs an explicit credential ref. */
  baseUrl?: string
  mode?: UsageMode
  config?: UsageStateConfig
  /** The `llm-deepseek` settings namespace, when the host has it. */
  deepseekSettings?: unknown
  /** The `llm-pi-ai` settings namespace, when the host has it. */
  piAiSettings?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Discover only the target owner's declared ref, never another provider's key. */
export function providerCredentialRefs(input: ProviderCredentialRefsInput): string[] {
  if (input.mode === 'account' || input.provider === undefined) return []
  const config = input.config ?? DEFAULT_CONFIG
  const providers = asRecord(asRecord(input.piAiSettings)?.providers)
  const profile = asRecord(providers?.[input.provider])
  let ref: unknown
  if (profile !== undefined) {
    const baseUrl = typeof profile.baseURL === 'string' ? profile.baseURL : undefined
    const resolution = resolveProvider({ provider: input.provider, endpointHint: baseUrl, config, catalog: CATALOG })
    if (resolution.sourceId !== input.sourceId || resolution.mode === null) return []
    if (input.mode !== undefined && resolution.mode !== input.mode) return []
    if (input.baseUrl !== undefined && originOf(input.baseUrl) !== originOf(baseUrl)) return []
    ref = profile.apiKeyEnv
  } else if (input.sourceId === 'deepseek' && ['deepseek', 'deepseek-official'].includes(input.provider)) {
    // The native DeepSeek plugin owns these ids, not every DeepSeek-like relay.
    if (input.baseUrl !== undefined && originOf(input.baseUrl) !== 'https://api.deepseek.com') return []
    ref = asRecord(input.deepseekSettings)?.apiKeyEnv
  }
  return typeof ref === 'string' && ref.trim() !== '' ? [ref.trim()] : []
}

/**
 * The endpoint each configured DSH provider declares (`llm-pi-ai` profiles carry a
 * `baseURL`). Its origin also supplies the account request endpoint, and a
 * sanitized origin is shared with the browser for consistent resolution.
 */
export function providerEndpointHints(piAiSettings: unknown): Record<string, string> {
  const providers = asRecord(asRecord(piAiSettings)?.providers)
  const hints: Record<string, string> = {}
  if (providers === undefined) return hints

  for (const [providerId, raw] of Object.entries(providers)) {
    const profile = asRecord(raw)
    const baseUrl = profile === undefined ? undefined : profile.baseURL
    if (typeof baseUrl !== 'string') continue
    const trimmed = baseUrl.trim()
    if (trimmed !== '') hints[providerId] = trimmed
  }
  return hints
}

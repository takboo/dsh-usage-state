import { DEFAULT_CONFIG, type UsageStateConfig } from './shared/config.ts'
import { originOf } from './shared/providers.ts'
import { toSourceCatalog } from './host/catalog.ts'
import { withCredentialFallback, type FallbackDeps } from './host/credential-fallback.ts'
import { describeCredentials, resolveApiKey, type CredentialLookup } from './host/credentials.ts'
import { providerCredentialRefs, providerEndpointHints } from './host/provider-refs.ts'
import { createTargetReader, type FetchLike } from './host/read.ts'
import { UsageStateStore } from './host/refresh.ts'
import { UsageStateService, USAGE_STATE_RPC_NAMESPACE, USAGE_STATE_SERVICE } from './host/service.ts'
import { installUsageStateSettings, type VolatileLike } from './host/settings.ts'
import { ALL_SOURCES, findSource } from './host/sources/index.ts'
import { resolveTargets, type UsageTarget } from './host/targets.ts'

/**
 * The cordis members this plugin touches, typed structurally so the host half
 * depends on no platform *types*. (`@deepseek-ai/schemastery` is the one platform
 * package it imports at runtime, because the loader validates the exported
 * `Config` through it.)
 */
export interface PluginContextLike {
  get(name: string): unknown
  on(event: string, handler: (...args: unknown[]) => void): () => void
  effect(callback: () => (() => void) | void, label?: string): void
  provide(name: string, value: unknown): void
  /** From the cordis timer plugin (see `inject` below). */
  timeout(callback: () => void, delay: number): () => void
  interval(callback: () => void, delay: number): () => void
}

export interface UsageStateDeps {
  /** Overridden in tests; production uses the global fetch. */
  fetch?: FetchLike
  now?: () => number
  /**
   * Direct credential fallbacks (environment, credentials file). Tests pass
   * `false` so a unit test can never pick up the developer's real key.
   */
  credentialFallback?: FallbackDeps | false
  /**
   * The live config reference the loader passes `apply` as its second argument.
   * Absent in tests that do not care about stored configuration.
   */
  config?: VolatileLike<unknown>
}

export const name = 'usage-state'
/** `timer` is what provides `ctx.timeout` / `ctx.interval`. */
export const inject = ['timer']
/**
 * The plugin's configuration schema. The loader resolves it from this module
 * export (`entry.fiber.runtime.Config`) and validates the row's `config` through
 * it, so it must be re-exported from the entry point — see `host/settings.ts` for
 * why it is a volatile `any`.
 */
export { Config } from './host/settings.ts'

interface LlmRuntimeLike {
  listProviders?(): ReadonlyArray<{ id?: unknown }>
}

interface CredentialsProviderLike {
  resolve(ref: string): Promise<{ value: string; source: string } | undefined>
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>
}

/** One profile entry as the config editor addresses it. */
interface ConfigEntryLike {
  options?: { id?: string }
  fiber?: { config?: unknown }
}

/** The shared volatile-reference protocol (`cosmokit.volatile.write`). */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** Whether a loader config value is a live volatile reference rather than data. */
export function isVolatileRef(value: unknown): value is VolatileLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    VOLATILE_WRITE in value &&
    typeof (value as { get?: unknown }).get === 'function'
  )
}

/**
 * Detach a loader config: volatile fields are live references, and a snapshot is
 * only useful once they are read out. Mirrors the platform's own `plainConfig`,
 * including its refusal to guard against cycles (config cannot contain one).
 */
export function plainConfig(value: unknown): unknown {
  if (isVolatileRef(value)) return plainConfig(value.get())
  if (Array.isArray(value)) return value.map(item => plainConfig(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainConfig(item)]))
  }
  return value
}

/**
 * Another plugin's resolved config, by profile entry id.
 *
 * DSH 0.1 answered this from `settings.get(namespace)`; 0.2 derives every
 * namespace from the entry that owns it, so the resolved value lives on that
 * entry's fiber (the same place the platform's settings service reads it).
 * A host without a config editor degrades to `undefined`, which is what this
 * plugin's provider refinement has always done when a namespace was absent.
 */
function readNamespace(ctx: PluginContextLike, namespace: string): unknown {
  const editor = ctx.get('configEditor') as { entries?(): ReadonlyArray<ConfigEntryLike> } | undefined
  if (typeof editor?.entries !== 'function') return undefined
  try {
    const entry = editor.entries().find(candidate => candidate.options?.id === namespace)
    return entry?.fiber?.config === undefined ? undefined : plainConfig(entry.fiber.config)
  } catch {
    return undefined
  }
}

/**
 * Credential access through the host's credential provider. A provider that is
 * absent or throws must degrade to "not configured" — never to a crash inside a
 * refresh loop.
 */
export function createCredentialLookup(
  ctx: PluginContextLike,
  fallback: FallbackDeps | false = {},
): CredentialLookup {
  const provider = ctx.get('credentials') as CredentialsProviderLike | undefined

  const platform: CredentialLookup = {
    resolve: async ref => {
      if (provider === undefined) return undefined
      try {
        return await provider.resolve(ref)
      } catch {
        return undefined
      }
    },
    describe: async ref => {
      if (provider === undefined) return { configured: false, writable: false }
      try {
        return await provider.describe(ref)
      } catch {
        return { configured: false, writable: false }
      }
    },
  }

  return fallback === false ? platform : withCredentialFallback(platform, fallback)
}

/**
 * Publish the service under the name the RPC gateway resolves.
 *
 * The binding shape is exact and unforgiving (`dsh-api-gateway`'s `readBinding`):
 *   - `service` must be the service OBJECT itself, not its name;
 *   - `serviceKey` must be the registered name;
 *   - `namespace` must equal the RPC namespace.
 * A mismatch fails every dispatch with `gateway/binding-invalid` — which looks
 * like "the plugin silently returns nothing" from the browser. Non-enumerable so
 * it stays out of any serialization of the service.
 */
export function provideUsageState(
  ctx: Pick<PluginContextLike, 'provide'>,
  service: UsageStateService,
): UsageStateService {
  Object.defineProperty(service, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: {
      service,
      serviceKey: USAGE_STATE_SERVICE,
      namespace: USAGE_STATE_RPC_NAMESPACE,
    },
  })
  ctx.provide(USAGE_STATE_SERVICE, service)
  return service
}

function isTurnEnd(event: unknown): boolean {
  return event !== null && typeof event === 'object' && (event as { type?: unknown }).type === 'turn/end'
}

/** Wire the whole host half; exported so tests can drive it with a fake context. */
export function createUsageState(ctx: PluginContextLike, deps: UsageStateDeps = {}): UsageStateService {
  const now = deps.now ?? ((): number => Date.now())
  const fetchImpl = deps.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const catalog = toSourceCatalog(ALL_SOURCES)
  const lookup = createCredentialLookup(ctx, deps.credentialFallback ?? {})

  let config: UsageStateConfig = DEFAULT_CONFIG
  let reconfigure = (): void => {}
  installUsageStateSettings(ctx, deps.config, next => {
    config = next
    reconfigure()
  })

  /**
   * The plugin's own configuration says nothing about which providers exist, so
   * ask the host's LLM runtime. This is what makes zero configuration work: a
   * provider nobody configured still resolves to its suggested source.
   */
  const providerFacts = (): { ids: string[] | undefined; hints: Record<string, string> } => {
    let ids: string[] | undefined
    try {
      const llm = ctx.get('llm') as LlmRuntimeLike | undefined
      if (typeof llm?.listProviders === 'function') {
        ids = []
        for (const provider of llm.listProviders()) {
          if (typeof provider?.id === 'string' && provider.id !== '') ids.push(provider.id)
        }
      }
    } catch {
      ids = undefined
      // The LLM runtime may not be ready on the first ticks; the next one retries.
    }
    return { ids, hints: providerEndpointHints(readNamespace(ctx, 'llm-pi-ai')) }
  }

  const targets = (): UsageTarget[] => {
    const { ids, hints } = providerFacts()
    return resolveTargets(config, { providers: ids, endpointHints: hints }).map(target => ({
      ...target,
      preferredRefs: providerCredentialRefs({
        sourceId: target.sourceId,
        deepseekSettings: readNamespace(ctx, 'llm-deepseek'),
        piAiSettings: readNamespace(ctx, 'llm-pi-ai'),
      }),
    }))
  }
  const optionsFor = (target: UsageTarget) => {
    const overrideRef = target.apiKeyRef
    return {
      ...(overrideRef === undefined ? {} : { overrideRef }),
      preferredRefs: target.preferredRefs ?? [],
    }
  }

  const store = new UsageStateStore({
    clock: {
      now,
      after: (ms, fn) => ctx.timeout(fn, ms),
      every: (ms, fn) => ctx.interval(fn, ms),
    },
    policy: () => config.refresh,
    targets,
    findSource,
    credentials: {
      resolve: async target => {
        const source = findSource(target.sourceId)
        if (source === undefined) return undefined
        const resolved = await resolveApiKey(source, target.mode, optionsFor(target), lookup)
        if (resolved === undefined) return undefined
        if (target.baseUrl === undefined) return resolved
        return {
          ...resolved,
          baseUrl: target.baseUrl,
          ...(target.baseUrlPinned === true ? { baseUrlPinned: true } : {}),
        }
      },
    },
    read: createTargetReader({ fetch: fetchImpl }),
  })

  reconfigure = () => store.reconfigure()

  const service = new UsageStateService({
    store,
    targets,
    catalog: () => catalog,
    endpointHints: () => Object.fromEntries(
      Object.entries(providerFacts().hints).flatMap(([provider, endpoint]) => {
        const origin = originOf(endpoint)
        return origin === undefined ? [] : [[provider, origin]]
      }),
    ),
    describe: async target => {
      const source = findSource(target.sourceId)
      if (source === undefined) return { candidates: [], configured: false }
      return describeCredentials(source, target.mode, optionsFor(target), lookup)
    },
    now,
  })

  // A finished turn is when provider-side settlement has just happened, so this
  // is the most accurate moment to re-read; the store delays and coalesces.
  ctx.on('session/event', (...args) => {
    if (isTurnEnd(args[1])) store.onTurnEnd()
  })
  ctx.effect(() => store.start(), 'dsh-usage-state: refresh scheduling')

  return provideUsageState(ctx, service)
}

/**
 * Cordis entry point. The second argument is the loader's resolved config for this
 * entry — a live reference, because the exported schema is a volatile root.
 */
export function apply(ctx: PluginContextLike, config?: VolatileLike<unknown>): void {
  createUsageState(ctx, { config })
}

import { existsSync, readFileSync } from 'node:fs'

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadBrowserFace, realRegistry, shellModuleTable } from '../support/browser-face.mjs'

/**
 * Guards the *shipped* artifacts. The bundles are committed because
 * `dsh plugin add github:...` installs straight from the repository with no build
 * step, so a broken or mis-wrapped bundle would ship silently.
 *
 * Run `npm run build` first. Missing committed delivery artifacts are a hard
 * failure: a checkout with absent bundles must never look like passing tests.
 */
const CLIENT = new URL('../../lib/client.js', import.meta.url)
const HOST = new URL('../../lib/index.js', import.meta.url)
const TYPERT = new URL('../../lib/typert.js', import.meta.url)
const PACKAGE = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  main?: string
  exports?: Record<string, unknown>
  dsh?: { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } }
  dependencies?: Record<string, string>
}

/** Exactly the modules the shell's require table provides. */
const ALLOWED_CLIENT_REQUIRES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

function requireBuilt(): void {
  for (const file of [CLIENT, HOST, TYPERT]) {
    assert.ok(existsSync(file), `required delivery artifact is missing: ${file.pathname}; run npm run build`)
  }
}

test('the browser bundle is wrapped in the module-loader envelope', t => {
  requireBuilt()
  const code = readFileSync(CLIENT, 'utf8')

  assert.match(code, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(code, new RegExp(`id: "${PACKAGE.name}"`))
  assert.match(code, /factory: \(require\) => \{/)
  // The bundler reformats the footer, so match its shape rather than its bytes.
  assert.match(code, /return module\.exports;\s*\}\s*\}\);\s*$/)
})

test('the browser bundle requires nothing outside the shell module table', t => {
  requireBuilt()
  const code = readFileSync(CLIENT, 'utf8')
  const requires = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])

  assert.ok(requires.length > 0, 'expected the bundle to require react at least')
  for (const specifier of requires) {
    assert.ok(ALLOWED_CLIENT_REQUIRES.has(specifier as string), `unexpected client require: ${specifier}`)
  }
  assert.doesNotMatch(code, /from\s*"node:/, 'the browser bundle must not reference node builtins')
})

test('the host bundle is ESM exporting the cordis entry points', t => {
  requireBuilt()
  const code = readFileSync(HOST, 'utf8')

  // The loader reads `Config` off the module namespace and calls `apply(ctx, config)`.
  assert.match(code, /export \{[^}]*\bConfig\b[^}]*\}/)
  assert.match(code, /export \{[^}]*\bapply\b[^}]*\}/)
  assert.match(code, /inject/)
  assert.doesNotMatch(code, /require\(/, 'the host bundle should be ESM')
  // The schema has to come from the platform's own schemastery: the loader validates
  // through `Config['~standard']` and compares volatile roots by that vendor.
  assert.match(code, /from "@deepseek-ai\/schemastery"/, 'schemastery must stay external')
})

test('the typert bundle exports the named manifest and keeps zod external', t => {
  requireBuilt()
  const code = readFileSync(TYPERT, 'utf8')

  assert.match(code, /export \{[^}]*TYPERT[^}]*\}/)
  assert.match(code, /from "zod"/)
  assert.match(PACKAGE.dependencies?.zod ?? '', /^4\.\d+\.\d+$/, 'the host codecs need a pinned zod v4 as a real dependency')
})

test('every declared export and manifest path exists once built', t => {
  requireBuilt()

  for (const [key, value] of Object.entries(PACKAGE.exports ?? {})) {
    const target = typeof value === 'string' ? value : (value as { default?: string }).default
    assert.ok(target !== undefined, `export ${key} has no default target`)
    assert.ok(existsSync(new URL(`../../${target}`, import.meta.url)), `export ${key} points at a missing file: ${target}`)
  }
  assert.equal(PACKAGE.main, 'lib/index.js')
  assert.ok(existsSync(new URL(`../../${PACKAGE.dsh?.bundle?.patch ?? ''}`, import.meta.url)))
  assert.equal(PACKAGE.dsh?.client?.platform, 'web')
})

/**
 * The shipped host bundle, driven by a fake cordis context. This catches
 * packaging mistakes (a missing dependency, an accidental bundling of platform
 * code) that unit tests over `src/` cannot see.
 */
test('the built host bundle wires up and reads a balance through a fake host', async t => {
  requireBuilt()

  const mod = (await import(HOST.href)) as {
    createUsageState: (ctx: unknown, deps: unknown) => { getState(force: boolean): Promise<unknown> }
  }

  const provided = new Map<string, unknown>()
  // What the loader passes `apply` for a volatile root: a live reference, not data.
  const config = {
    get: () => ({ models: [{ provider: 'deepseek-official', model: 'deepseek-flash', sourceId: 'deepseek', mode: 'api' }] }),
  }
  const ctx = {
    get: (name: string) =>
      name === 'credentials'
        ? {
            resolve: async (ref: string) => (ref === 'DEEPSEEK_API_KEY' ? { value: 'sk-test', source: 'env' } : undefined),
            describe: async () => ({ configured: true, writable: true }),
          }
        : undefined,
    on: () => () => undefined,
    effect: (callback: () => void) => callback(),
    provide: (key: string, value: unknown) => provided.set(key, value),
    timeout: () => () => undefined,
    interval: () => () => undefined,
  }

  const urls: string[] = []
  const service = mod.createUsageState(ctx, {
    config,
    fetch: async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: '66.28' }] }) }
    },
    credentialFallback: false,
  })

  const state = (await service.getState(false)) as {
    snapshots: Record<string, { balances: Array<{ amount: number; currency: string }> }>
    sources: unknown[]
  }

  assert.deepEqual(urls, ['https://api.deepseek.com/user/balance'])
  assert.deepEqual(state.snapshots['deepseek:api']?.balances, [{ amount: 66.28, currency: 'CNY' }])
  assert.equal(state.sources.length, 5)
  assert.equal(provided.get('usageState'), service)
  const builtBinding = (service as unknown as { typertRemote?: { service: unknown; serviceKey: string; namespace: string } })
    .typertRemote
  assert.equal(builtBinding?.service, service, 'binding.service must be the service object itself')
  assert.equal(builtBinding?.serviceKey, 'usageState')
  assert.equal(builtBinding?.namespace, 'usageState')
})

/**
 * The shipped browser bundle, mounted through the platform's real Typert registry.
 *
 * The source-level equivalent lives in `tests/client/contribution.test.ts`; this one
 * exists because the contract that broke in 0.4.0 was carried by the *artifact* —
 * whatever the bundler does to the contribution is what the browser actually mounts.
 * A rejected mount leaves every reading missing while the entry still activates, so
 * nothing else in this file would notice.
 */
test('the built browser bundle mounts its RPC contribution through the real 0.2 registry', async t => {
  requireBuilt()

  const client = loadBrowserFace(CLIENT.pathname, shellModuleTable()) as { apply(ctx: unknown): void; inject: string[] }
  const registry = await realRegistry()
  const events: string[] = []
  const disposers: Array<() => void> = []
  let mountError: unknown
  const form = {
    getSnapshot: () => ({ status: 'ready', value: {}, revision: 1, writable: true, mode: 'host' }),
    subscribe: () => () => undefined,
    set: async () => true,
    unset: async () => true,
    mutate: async () => true,
  }
  const ctx = {
    effect: (callback: () => unknown) => {
      const dispose = callback()
      if (typeof dispose === 'function') {
        events.push('effect')
        // Disposed at the end: the poll loop is a real `setInterval`, and an
        // undisposed one keeps `node:test` alive until its 30s tick.
        disposers.push(dispose as () => void)
      }
    },
    on: () => () => undefined,
    get: () => undefined,
    locale: { register: () => () => undefined, bind: () => (key: string) => key },
    slots: { inject: () => () => undefined, register: () => () => undefined },
    configForms: {
      get: (namespace: string) => {
        events.push(`configForms.get(${namespace})`)
        return form
      },
    },
    remote: {
      // The platform's mount path: validate the contribution, then install the
      // `remote.<namespace>` service. This is the step that threw on 0.2.
      $mount: async (contribution: unknown) => {
        try {
          await registry.register(contribution)
          events.push('mounted')
        } catch (error) {
          mountError = error
          throw error
        }
        return () => undefined
      },
    },
  }

  const errors: string[] = []
  const realError = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }
  try {
    client.apply(ctx)
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    console.error = realError
    for (const dispose of disposers.reverse()) dispose()
  }

  assert.equal(mountError, undefined, `the shipped contribution was rejected: ${String(mountError)}`)
  assert.deepEqual(errors, [], 'a rejected mount must also be reported, not swallowed')
  assert.notEqual(registry.lookup('usageState/getState'), undefined)
  assert.notEqual(registry.lookup('usageState/describeCredentials'), undefined)
  assert.deepEqual(events, ['effect', 'configForms.get(usage-state)', 'effect', 'effect', 'mounted'])
})

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Load and drive the platform's **browser face** the way the shell does.
 *
 * Platform client bundles are classic scripts wrapped in
 * `window.__ModuleLoader__.load({ id, factory })`, and the shell answers the
 * factory's `require` calls from a fixed module table. Reproducing both here is what
 * lets a Node test reach the real Typert registry — the validator that rejected a
 * contribution DSH 0.1.5 had accepted.
 */
const require = createRequire(import.meta.url)

// Compatibility runs resolve real platform packages from an isolated install;
// ordinary tests retain the lockfile's minimum supported DSH baseline.
export const platformRequire = process.env.DSH_PLATFORM_ROOT
  ? createRequire(path.join(path.resolve(process.env.DSH_PLATFORM_ROOT), 'package.json'))
  : require

/**
 * Evaluate one browser-face bundle and return its exports.
 * @param absolutePath - bundle file on disk.
 * @param request - module-table lookup; platform faces get Node resolution, plugin
 *   bundles get {@link shellModuleTable} (the shell provides only those three).
 * @returns the bundle's exports.
 */
export function loadBrowserFace(absolutePath, request = specifier => require(specifier)) {
  let captured
  const window = { __ModuleLoader__: { load: specification => { captured = specification } } }
  new Function('window', readFileSync(absolutePath, 'utf8'))(window)
  if (captured === undefined) throw new Error(`no module-loader envelope in ${absolutePath}`)
  return captured.factory(request)
}

/**
 * The three modules the shell's require table hands this plugin's browser half.
 * @returns a `require` implementation for {@link loadBrowserFace}.
 */
export function shellModuleTable() {
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: value => [typeof value === 'function' ? value() : value, () => undefined],
    useEffect: () => undefined,
    useMemo: factory => factory(),
    useCallback: fn => fn,
    useRef: value => ({ current: value }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    Fragment: Symbol('Fragment'),
  }
  const jsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: Symbol('Fragment'),
  }
  const primitives = new Proxy({}, { get: (_target, key) => props => ({ type: String(key), props }) })
  return specifier => {
    if (specifier === 'react') return react
    if (specifier === 'react/jsx-runtime') return jsxRuntime
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected client require: ${specifier}`)
  }
}

/**
 * Mount the platform's real browser-face Typert registry on a fresh cordis context.
 * @returns the context plus a `register` that performs the platform's own
 *   contribution step (validate, then install one `remote.<namespace>` service).
 */
export async function realRegistry() {
  const { Context } = await import(pathToFileURL(platformRequire.resolve('@deepseek-ai/cordis')).href)
  const manifestPath = platformRequire.resolve('@deepseek-ai/dsh-typert-registry/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  // DSH 0.2.1 ships separate Node and browser faces. Resolve the browser
  // condition explicitly: require.resolve('./client') now selects Node ESM.
  const client = manifest.exports['./client']
  const browserPath = path.resolve(path.dirname(manifestPath), client.browser ?? client.default)
  const registry = loadBrowserFace(browserPath, specifier => platformRequire(specifier))
  const ctx = new Context()
  await ctx.plugin(registry)
  return {
    ctx,
    register: contribution => ctx.typert.remotes.register(contribution),
    lookup: endpoint => ctx.typert.remotes.get(endpoint),
  }
}

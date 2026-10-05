import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

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
  const { Context } = await import('@deepseek-ai/cordis')
  const registry = loadBrowserFace(require.resolve('@deepseek-ai/dsh-typert-registry/client'))
  const ctx = new Context()
  await ctx.plugin(registry)
  return {
    ctx,
    register: contribution => ctx.typert.remotes.register(contribution),
    lookup: endpoint => ctx.typert.remotes.get(endpoint),
  }
}

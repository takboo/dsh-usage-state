import z from '@deepseek-ai/schemastery'

import { normalizeConfig, type UsageStateConfig } from '../shared/config.ts'

/**
 * Settings namespace owned by this plugin.
 *
 * DSH 0.2 derives a settings namespace from the profile entry that owns it, so
 * this has to equal the `id` of the row this plugin's bundle patch inserts, and
 * it is the key the client's `configForms.get()` asks for.
 */
export const USAGE_STATE_NS = 'usage-state'

/**
 * The plugin's `Config`, which the 0.2 loader resolves from this module export
 * (`entry.fiber.runtime.Config`), validates with `Config['~standard']`, and hands
 * to `apply` as its second argument.
 *
 * Two deliberate choices, both about staying compatible with documents this
 * plugin does not fully control:
 *
 * - **A volatile root.** The loader hands a volatile schema's value over as a live
 *   reference, commits edits into it in place, and announces them as
 *   `loader/volatile-update`. A non-volatile schema would instead find the config
 *   "changed" on every settings write and remount the plugin.
 * - **`any`, not a field-by-field object.** The settings service projects form
 *   values *through* the schema, so a declared object schema silently drops every
 *   field it does not declare — including keys a hand-edited document carries, and
 *   including keys a future version adds. Validation stays where it has always
 *   been: `normalizeConfig`, which is deliberately lenient, so a dirty document
 *   still loads instead of failing the entry.
 */
export const Config = z.any().volatile()

/** The live config reference the loader supplies for a volatile root. */
export interface VolatileLike<T> {
  get(): T
}

/** The cordis members used here, typed structurally. */
export interface HostContextLike {
  on(event: string, handler: (...args: unknown[]) => void): () => void
}

/**
 * Keep a live snapshot of the plugin's own config.
 *
 * `reference` is `apply`'s second argument. On a host that does not model volatile
 * config (or when the entry carries no schema) the loader passes nothing, and the
 * plugin keeps its own defaults — the same graceful degradation the 0.1 path got
 * from `ctx.inject(['settings'], …)`, which 0.2 no longer offers.
 */
export function installUsageStateSettings(
  ctx: HostContextLike,
  reference: VolatileLike<unknown> | undefined,
  onConfig: (config: UsageStateConfig) => void,
): void {
  if (reference === undefined) return
  const publish = (): void => {
    onConfig(normalizeConfig(reference.get()))
  }
  publish()
  ctx.on('loader/volatile-update', () => {
    publish()
  })
}

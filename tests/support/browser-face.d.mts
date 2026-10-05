/**
 * Types for the browser-face test helper (`browser-face.mjs`). Declared rather than
 * inferred so the support module can stay plain ESM, like the rest of `tests/support`.
 */

/** Evaluate one browser-face bundle and return its exports. */
export function loadBrowserFace(
  absolutePath: string,
  request?: (specifier: string) => unknown,
): unknown

/** A `require` implementation covering exactly the shell's three modules. */
export function shellModuleTable(): (specifier: string) => unknown

/** Mount the platform's real browser-face Typert registry on a fresh context. */
export function realRegistry(): Promise<{
  ctx: unknown
  register(contribution: unknown): Promise<unknown>
  lookup(endpoint: string): unknown
}>

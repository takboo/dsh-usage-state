import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import ts from 'typescript'

/**
 * Makes the browser half testable under `node:test`:
 *
 *  - `.tsx` is transpiled with the project's own TypeScript (Node's type
 *    stripping handles `.ts` but not JSX). Controls render their real plugin code;
 *    there are no Harness component substitutes.
 *
 * Load it with `node --import ./tests/support/client-render-hook.mjs`.
 */
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      const { outputText } = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        fileName: url,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2023,
          sourceMap: false,
        },
      })
      return { format: 'module', source: outputText, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

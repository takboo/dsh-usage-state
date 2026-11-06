import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'

import { apply } from '../../src/client/index.tsx'
import { en } from '../../src/client/locales.ts'
import type { ClientContextLike } from '../../src/client/context.ts'

test('configuration belongs to the keyed plugin row; its inline summary does not mount an editor', () => {
  const declarations: Array<{ owner: string; options: Record<string, unknown>; render: ComponentType<Record<string, unknown>> }> = []
  const form = {
    getSnapshot: () => ({ status: 'ready' as const, value: {}, revision: 1, writable: true, mode: 'host' as const }),
    subscribe: () => () => {}, set: async () => true, unset: async () => true, mutate: async () => true,
  }
  const namespaces: string[] = []
  let owner = ''
  const ctx = {
    // Mount neither the refresh loop nor the RPC contribution: this test exercises
    // actual slot registration and real React rendering, not background RPC.
    effect: () => {}, on: () => () => {}, get: () => undefined,
    locale: { register: () => () => {}, bind: () => (key: string) => (en as Record<string, string>)[key] ?? key },
    slots: {
      inject: (name: string, callback: () => unknown) => { owner = name; callback(); return () => {} },
      register: (options: Record<string, unknown>, render: ComponentType<Record<string, unknown>>) => {
        declarations.push({ owner, options, render }); return () => {}
      },
    },
    configForms: { get: (namespace: string) => { namespaces.push(namespace); return form } },
    remote: { $mount: async () => () => {} },
  }
  apply(ctx as unknown as ClientContextLike)
  assert.deepEqual(namespaces, ['usage-state'])
  assert.equal(declarations.some(declaration => declaration.options.name === 'settings.section'), false)
  const slot = declarations.find(declaration => declaration.options.name === 'plugins.row.config')
  assert.ok(slot)
  assert.equal(slot.owner, 'plugins.row.config')
  assert.equal(slot.options.key, 'dsh-usage-state#usage-state')
  assert.equal(slot.options.locale, 'usage-state')
  const inject = slot.options.inject as () => Record<string, unknown>
  const injected = inject()
  const props = { ...injected, t: ctx.locale.bind() }
  const summary = renderToStaticMarkup(h(slot.render, { ...props, view: 'summary' }))
  assert.match(summary, /balance|quota/i)
  assert.doesNotMatch(summary, /<(?:div|section|header|button|input|select|h[1-6]|p)\b/)
  let editorRefreshes = 0
  const store = injected.usageState as { refreshModels(): Promise<void>; refreshCredentials(): Promise<void> }
  store.refreshModels = store.refreshCredentials = async () => { editorRefreshes++ }
  let renderer!: ReturnType<typeof create>
  act(() => { renderer = create(h(slot.render, { ...props, view: 'summary' })) })
  act(() => renderer.unmount())
  assert.equal(editorRefreshes, 0, 'the inline summary must not mount editor effects')
  const page = renderToStaticMarkup(h(slot.render, { ...props, view: 'page' }))
  assert.match(page, /Save settings/)
  assert.doesNotMatch(page, /<h3|>Close<|Balance &amp; Quota/)
  const verifiedTokens = new Set([
    '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
    '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
    '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-state-error-primary',
    '--dsw-alias-state-idle-primary', '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
    '--dsw-specific-sidebar-fill',
  ])
  for (const token of page.matchAll(/var\((--dsw-[\w-]+)/g)) assert.ok(verifiedTokens.has(token[1]!), `theme token ${token[1]} was verified in the installed Host catalogue`)
})

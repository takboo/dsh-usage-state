import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer'

import { SettingsSection } from '../../src/client/SettingsSection.tsx'
import { UsageStateClientStore } from '../../src/client/store.ts'
import { usageStateSettings } from '../../src/client/settings-form.ts'
import { en } from '../../src/client/locales.ts'
import { normalizeConfig } from '../../src/shared/config.ts'
import type { SourceCatalog } from '../../src/shared/display.ts'
import type { CredentialReport } from '../../src/shared/rpc.ts'
import type { CredentialsRemoteLike, SettingsPathOp } from '../../src/client/context.ts'

const translate = (key: string, params?: Record<string, unknown>) => {
  let value = (en as Record<string, string>)[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

const catalog: SourceCatalog = [
  { id: 'deepseek', displayName: 'DeepSeek', modes: ['api'], requiresBaseUrl: false,
    defaultBaseUrl: { api: 'https://api.deepseek.com' }, credentialRefs: { api: ['DEEPSEEK_API_KEY'] } },
  { id: 'zai', displayName: 'z.ai / GLM', modes: ['coding-plan'], requiresBaseUrl: false,
    defaultBaseUrl: { 'coding-plan': 'https://api.z.ai' }, credentialRefs: { 'coding-plan': ['ZAI_API_KEY'] } },
]

async function page(context: { after(callback: () => void | Promise<void>): unknown }, options: {
  value?: unknown
  writable?: boolean
  report?: CredentialReport
  mutation?: (ops: readonly SettingsPathOp[]) => Promise<boolean>
  credentials?: CredentialsRemoteLike
} = {}) {
  const listeners = new Set<() => void>()
  let snapshot = {
    status: 'ready' as const, value: normalizeConfig(options.value ?? {}), revision: 1,
    writable: options.writable ?? true, mode: 'host' as const,
  }
  const writes: Array<readonly SettingsPathOp[]> = []
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async () => true,
    unset: async () => true,
    mutate: async (ops: readonly SettingsPathOp[]) => {
      writes.push(structuredClone(ops))
      if (options.mutation !== undefined) return options.mutation(ops)
      const value = structuredClone(snapshot.value) as unknown as Record<string, unknown>
      for (const op of ops) {
        let parent = value
        for (const field of op.path.slice(0, -1)) {
          const existing = parent[field]
          if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) parent[field] = {}
          parent = parent[field] as Record<string, unknown>
        }
        const field = op.path.at(-1)
        if (field === undefined) continue
        if (op.op === 'set') parent[field] = op.value
        else delete parent[field]
      }
      snapshot = { ...snapshot, value: normalizeConfig(value), revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
      return true
    },
  }
  const report: CredentialReport = options.report ?? { credentials: { 'deepseek:api': {
    configured: true, ref: 'DEEPSEEK_API_KEY', writable: true,
    candidates: [{ ref: 'DEEPSEEK_API_KEY', configured: true, writable: true, source: 'store' }],
  } } }
  const refreshes: boolean[] = []
  const store = new UsageStateClientStore({
    getState: async force => {
      refreshes.push(force)
      return { ok: true, value: { sources: catalog, snapshots: {}, checkedAt: 1000 } }
    },
    describeCredentials: async () => ({ ok: true, value: report }),
    modelCatalog: async () => ({ ok: true, value: { groups: [
      { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'm', name: 'Model' }] },
      { id: 'zai', name: 'z.ai', models: [{ id: 'm', name: 'Model' }] },
    ] } }),
  })
  await store.refresh(false)
  const credentials: CredentialsRemoteLike = options.credentials ?? {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => ({ ok: true, value: undefined }),
    unset: async () => ({ ok: true, value: undefined }),
  }
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(h(SettingsSection, {
      t: translate, close: () => {}, usageState: store, settings: usageStateSettings(form), credentials,
    }))
  })
  context.after(() => { act(() => renderer.unmount()) })
  return { renderer, writes, refreshes, store, form }
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root.findAllByType('button').find(node => node.children.join('') === label)
  assert.ok(found, `button ${label} is available`)
  return found
}

function password(renderer: ReactTestRenderer): ReactTestInstance {
  const found = renderer.root.findAllByType('input').find(node => node.props.type === 'password')
  assert.ok(found, 'the provider offers a key input')
  return found
}

function text(renderer: ReactTestRenderer): string {
  return renderer.root.findAll(node => typeof node.type === 'string')
    .flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ')
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve))

test('a default provider can be moved without first creating a stored order', async context => {
  const { renderer, writes } = await page(context)
  const move = renderer.root.findAllByType('button').find(node => node.props['aria-label'] === 'Move down')
  assert.ok(move)
  assert.equal(move.props.disabled, false)

  await act(async () => { move.props.onClick(); await flush() })

  assert.deepEqual(writes, [[{ op: 'set', path: ['order'], value: ['zai', 'deepseek'] }]])
})

test('a refused configuration write is visible to the user and leaves the mode unchanged', async context => {
  const { renderer, writes } = await page(context, { mutation: async () => false })

  await act(async () => { button(renderer, 'Hidden').props.onClick(); await flush() })

  assert.equal(writes.length, 1)
  assert.match(text(renderer), /Could not save settings/)
})

test('a read-only credential cannot be cleared from the settings panel', async context => {
  let cleared = 0
  const { renderer } = await page(context, {
    report: { credentials: { 'deepseek:api': {
      configured: true, ref: 'DEEPSEEK_API_KEY', writable: false,
      candidates: [{ ref: 'DEEPSEEK_API_KEY', configured: true, writable: false, source: 'env' }],
    } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => ({ ok: true, value: undefined }),
      unset: async () => { cleared++; return { ok: true, value: undefined } },
    },
  })

  assert.equal(password(renderer).props.disabled, true)
  assert.equal(button(renderer, 'Clear').props.disabled, true)
  await act(async () => { button(renderer, 'Clear').props.onClick(); await flush() })
  assert.equal(cleared, 0)
})

test('a rejected credential save is shown as an error instead of an unhandled rejection', async context => {
  const { renderer } = await page(context, { credentials: {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => { throw new Error('credential connection lost') },
    unset: async () => ({ ok: true, value: undefined }),
  } })
  act(() => password(renderer).props.onChange({ target: { value: 'replacement-test-key' } }))

  await act(async () => { button(renderer, 'Save').props.onClick(); await flush() })

  assert.match(text(renderer), /Could not save: credential connection lost/)
})

test('an in-flight credential update disables controls and coalesces repeated save events', async context => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  let saves = 0
  const { renderer } = await page(context, { credentials: {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => { saves++; await gate; return { ok: true, value: undefined } },
    unset: async () => ({ ok: true, value: undefined }),
  } })
  act(() => password(renderer).props.onChange({ target: { value: 'replacement-test-key' } }))
  try {
    await act(async () => {
      const save = button(renderer, 'Save').props.onClick
      save(); save()
      await flush()
    })
    assert.equal(saves, 1)
    assert.equal(password(renderer).props.disabled, true)
    assert.equal(button(renderer, 'Save').props.disabled, true)
    assert.equal(button(renderer, 'Clear').props.disabled, true)
  } finally {
    await act(async () => { release?.(); await flush() })
  }
  assert.match(text(renderer), /Saved/)
})

test('saving a key uses the explicit provider ref even while its prior description is visible', async context => {
  const saved: Array<{ ref: string; value: string }> = []
  const { renderer, refreshes } = await page(context, {
    value: { providers: { deepseek: { mode: 'api', apiKeyRef: 'TEAM_KEY' } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async (ref, value) => { saved.push({ ref, value }); return { ok: true, value: undefined } },
      unset: async () => ({ ok: true, value: undefined }),
    },
  })
  act(() => password(renderer).props.onChange({ target: { value: 'team-test-key' } }))

  await act(async () => { button(renderer, 'Save').props.onClick(); await flush() })

  assert.deepEqual(saved, [{ ref: 'TEAM_KEY', value: 'team-test-key' }])
  assert.deepEqual(refreshes, [false, true])
})

test('blurring an untouched field does not restore its draft after an external update', async context => {
  const { renderer, form, writes } = await page(context)
  await act(async () => {
    await form.mutate([{ op: 'set', path: ['refresh', 'intervalMinutes'], value: 10 }])
  })
  const interval = renderer.root.findAllByType('input').find(node => node.props.type === 'number' && node.props.value === '10')
  assert.ok(interval, 'the current host value is displayed')

  await act(async () => { interval.props.onBlur(); await flush() })

  assert.equal(form.getSnapshot().value.refresh.intervalMinutes, 10)
  assert.equal(writes.length, 1, 'a blur with no user edit sends no additional mutation')
})

test('read-only configuration disables provider edits without changing credential permissions', async context => {
  const { renderer, writes } = await page(context, { writable: false })

  assert.equal(button(renderer, 'Hidden').props.disabled, true)
  assert.equal(password(renderer).props.disabled, false)
  await act(async () => { button(renderer, 'Hidden').props.onClick(); await flush() })
  assert.deepEqual(writes, [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer'

import { SettingsSection } from '../../src/client/SettingsSection.tsx'
import { UsageStateClientStore } from '../../src/client/store.ts'
import { usageStateSettings } from '../../src/client/settings-form.ts'
import { en } from '../../src/client/locales.ts'
import { normalizeConfig } from '../../src/shared/config.ts'
import { toSourceCatalog } from '../../src/host/catalog.ts'
import { resolveProvider } from '../../src/shared/providers.ts'
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
  mutation?: (ops: readonly SettingsPathOp[], revision?: number) => Promise<boolean>
  credentials?: CredentialsRemoteLike
  endpointHints?: Record<string, string>
  catalog?: SourceCatalog
  groups?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>
} = {}) {
  const listeners = new Set<() => void>()
  let snapshot = {
    status: 'ready' as const, value: normalizeConfig(options.value ?? {}), revision: 1,
    writable: options.writable ?? true, mode: 'host' as const,
  }
  const writes: Array<readonly SettingsPathOp[]> = []
  const revisions: Array<number | undefined> = []
  const publish = (value: unknown) => {
    snapshot = { ...snapshot, value: normalizeConfig(value), revision: snapshot.revision + 1 }
    for (const listener of listeners) listener()
  }
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async () => true,
    unset: async () => true,
    mutate: async (ops: readonly SettingsPathOp[], revision?: number) => {
      writes.push(structuredClone(ops))
      revisions.push(revision)
      if (options.mutation !== undefined && !await options.mutation(ops, revision)) return false
      if (revision !== undefined && revision !== snapshot.revision) return false
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
      return { ok: true, value: { sources: options.catalog ?? catalog, snapshots: {}, checkedAt: 1000, endpointHints: options.endpointHints } }
    },
    describeCredentials: async () => ({ ok: true, value: report }),
    modelCatalog: async () => ({ ok: true, value: { groups: options.groups ?? [
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
      t: translate, usageState: store, settings: usageStateSettings(form), credentials,
    }))
  })
  context.after(() => { act(() => renderer.unmount()) })
  return { renderer, writes, revisions, publish, refreshes, store, form }
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root.findAllByType('button').find(node => node.children.join('') === label)
  assert.ok(found, `button ${label} is available`)
  return found
}

function mode(renderer: ReactTestRenderer, provider = 'DeepSeek'): ReactTestInstance {
  return renderer.root.findByProps({ 'aria-label': `Mode for ${provider}` })
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

  assert.deepEqual(writes, [], 'moving a provider stages locally')
  const key = renderer.root.findByProps({ 'data-usage-provider': 'deepseek' }).findAllByType('input').find(node => node.props.type === 'password')!
  assert.equal(key.props.disabled, false, 'ordering does not change credential routing')
  assert.equal(button(renderer, 'Save settings').props.disabled, false)
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.deepEqual(writes, [[{ op: 'set', path: ['order'], value: ['zai', 'deepseek'] }]])
})

test('a refused configuration write is visible and retains the staged mode instead of changing accepted config', async context => {
  const { renderer, writes, form } = await page(context, { mutation: async () => false })
  act(() => mode(renderer).props.onChange({ target: { value: 'hidden' } }))
  assert.equal(mode(renderer).props.value, 'hidden')
  assert.equal(form.getSnapshot().value.providers.deepseek, undefined)
  assert.deepEqual(writes, [])
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.deepEqual(writes, [[{ op: 'set', path: ['providers', 'deepseek', 'mode'], value: 'hidden' }]])
  assert.equal(mode(renderer).props.value, 'hidden')
  assert.equal(button(renderer, 'Save settings').props.disabled, false)
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
  assert.equal(button(renderer, 'Clear key now').props.disabled, true)
  await act(async () => { button(renderer, 'Clear key now').props.onClick(); await flush() })
  assert.equal(cleared, 0)
})

test('a rejected credential save is shown as an error instead of an unhandled rejection', async context => {
  const { renderer } = await page(context, { credentials: {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => { throw new Error('credential connection lost') },
    unset: async () => ({ ok: true, value: undefined }),
  } })
  act(() => password(renderer).props.onChange({ target: { value: 'replacement-test-key' } }))

  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })

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
      const save = button(renderer, 'Save key now').props.onClick
      save(); save()
      await flush()
    })
    assert.equal(saves, 1)
    assert.equal(password(renderer).props.disabled, true)
    assert.equal(button(renderer, 'Save key now').props.disabled, true)
    assert.equal(button(renderer, 'Clear key now').props.disabled, true)
  } finally {
    await act(async () => { release?.(); await flush() })
  }
  assert.match(text(renderer), /Saved/)
})

test('saving a key uses the accepted explicit provider ref with positively confirmed permission', async context => {
  const saved: Array<{ ref: string; value: string }> = []
  const { renderer, refreshes } = await page(context, {
    value: { providers: { deepseek: { mode: 'api', apiKeyRef: 'TEAM_KEY' } } },
    report: { credentials: { 'deepseek:api': { configured: false, ref: 'TEAM_KEY', writable: true,
      candidates: [{ ref: 'TEAM_KEY', configured: false, writable: true }] } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async (ref, value) => { saved.push({ ref, value }); return { ok: true, value: undefined } },
      unset: async () => ({ ok: true, value: undefined }),
    },
  })
  act(() => password(renderer).props.onChange({ target: { value: 'team-test-key' } }))

  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })

  assert.deepEqual(saved, [{ ref: 'TEAM_KEY', value: 'team-test-key' }])
  assert.deepEqual(refreshes, [false, true])
})

test('an unsubmitted masked key draft cannot cross into a newly saved and confirmed credential ref', async context => {
  const saved: Array<{ ref: string; value: string }> = []
  const report: CredentialReport = { credentials: { 'deepseek:api': { configured: false, ref: 'OLD_KEY', writable: true,
    candidates: [{ ref: 'OLD_KEY', configured: false, writable: true }] } } }
  const { renderer, store, form } = await page(context, {
    value: { providers: { deepseek: { mode: 'api', apiKeyRef: 'OLD_KEY' } } }, report,
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async (ref, value) => { saved.push({ ref, value }); return { ok: true, value: undefined } },
      unset: async () => ({ ok: true, value: undefined }),
    },
  })
  act(() => password(renderer).props.onChange({ target: { value: 'old-target-test-key' } }))
  act(() => renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate('apiKeyRef'))!.props.onChange({ target: { value: 'NEW_KEY' } }))
  assert.equal(button(renderer, 'Save key now').props.disabled, true)
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.equal(form.getSnapshot().value.providers.deepseek?.apiKeyRef, 'NEW_KEY')
  report.credentials['deepseek:api'] = { configured: false, ref: 'NEW_KEY', writable: true,
    candidates: [{ ref: 'NEW_KEY', configured: false, writable: true }] }
  await act(async () => { await store.refreshCredentials() })
  assert.equal(password(renderer).props.disabled, false)
  assert.equal(password(renderer).props.value, '', 'the old target draft is not displayed for the new target')
  assert.equal(button(renderer, 'Save key now').props.disabled, true)
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.deepEqual(saved, [])
  act(() => password(renderer).props.onChange({ target: { value: 'new-target-test-key' } }))
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.deepEqual(saved, [{ ref: 'NEW_KEY', value: 'new-target-test-key' }])
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

test('clearing an endpoint override restores inheritance without persisting the provider endpoint', async context => {
  const { renderer, form, writes } = await page(context, {
    value: { providers: { deepseek: { mode: 'api', baseUrl: 'https://override.example' } } },
    endpointHints: { deepseek: 'https://declared.example' },
  })
  const endpoint = renderer.root.findAllByType('input').find(node => node.props.value === 'https://override.example')
  assert.ok(endpoint)
  assert.doesNotMatch(text(renderer), /Using the provider endpoint/)

  act(() => endpoint.props.onChange({ target: { value: '' } }))
  await act(async () => { endpoint.props.onBlur(); await flush() })

  assert.equal(endpoint.props.value, '')
  assert.equal(endpoint.props.placeholder, 'https://declared.example')
  assert.match(text(renderer), /Using the provider endpoint https:\/\/declared\.example/)
  assert.equal(form.getSnapshot().value.providers.deepseek?.baseUrl, 'https://override.example')
  assert.deepEqual(writes, [])
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.equal(form.getSnapshot().value.providers.deepseek?.baseUrl, undefined)
  assert.deepEqual(writes, [[{ op: 'unset', path: ['providers', 'deepseek', 'baseUrl'] }]])

  act(() => endpoint.props.onChange({ target: { value: 'https://replacement.example' } }))
  await act(async () => { endpoint.props.onBlur(); await flush() })

  assert.equal(form.getSnapshot().value.providers.deepseek?.baseUrl, undefined)
  assert.doesNotMatch(text(renderer), /Using the provider endpoint/)
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.equal(form.getSnapshot().value.providers.deepseek?.baseUrl, 'https://replacement.example')
})

test('an OpenAI endpoint override can be cleared in API mode to restore the gateway route', async context => {
  const sources = toSourceCatalog()
  const { renderer, form, writes } = await page(context, {
    catalog: sources,
    groups: [{ id: 'relay', name: 'Relay', models: [{ id: 'm', name: 'Model' }] }],
    value: { providers: { relay: { mode: 'api', baseUrl: 'https://api.openai.com' } } },
    endpointHints: { relay: 'https://gateway.example' },
    report: { credentials: {} },
  })
  assert.match(text(renderer), /OpenAI/)
  assert.equal(renderer.root.findAllByType('input').some(node => node.props.type === 'password'), false)

  const endpoint = renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate('baseUrl'))
  assert.ok(endpoint, 'ordinary modes must retain the endpoint editor even when OpenAI cannot supply a balance')
  act(() => endpoint.props.onChange({ target: { value: '' } }))
  assert.equal(mode(renderer, 'Relay').props.value, 'api')
  assert.equal(endpoint.props.placeholder, 'https://gateway.example')
  assert.deepEqual(writes, [])
  assert.equal(form.getSnapshot().value.providers.relay?.baseUrl, 'https://api.openai.com')

  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.equal(form.getSnapshot().value.providers.relay?.baseUrl, undefined)
  assert.equal(resolveProvider({
    provider: 'relay', config: form.getSnapshot().value, catalog: sources, endpointHint: 'https://gateway.example',
  }).key, 'sub2api:api')
  assert.deepEqual(writes, [[{ op: 'unset', path: ['providers', 'relay', 'baseUrl'] }]])
})

test('native progress switch stages its checked state until settings Save', async context => {
  const { renderer, writes, form } = await page(context)
  const previous = form.getSnapshot().value.display.progressBar
  const control = renderer.root.findByProps({ role: 'switch' })
  assert.equal(control.props['aria-label'], translate('progressBar'))
  assert.equal(control.props['aria-checked'], previous)
  await act(async () => { control.props.onClick(); await flush() })
  assert.deepEqual(writes, [])
  assert.equal(form.getSnapshot().value.display.progressBar, previous)
  assert.equal(renderer.root.findByProps({ role: 'switch' }).props['aria-checked'], !previous)
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.deepEqual(writes, [[{ op: 'set', path: ['display', 'progressBar'], value: !previous }]])
  assert.equal(form.getSnapshot().value.display.progressBar, !previous)
})

test('a focused first edit immediately enables Save, while Enter and blur never duplicate staged operations', async context => {
  const { renderer, writes } = await page(context)
  const input = () => renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate('thresholdWarn'))!
  assert.ok(input())
  act(() => input().props.onChange({ target: { value: '61' } }))
  assert.equal(button(renderer, 'Save settings').props.disabled, false)
  assert.deepEqual(writes, [])
  await act(async () => {
    input().props.onKeyDown({ key: 'Enter', target: { blur: () => input().props.onBlur() } })
    await flush()
  })
  act(() => input().props.onBlur())
  assert.deepEqual(writes, [])
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.deepEqual(writes, [[{ op: 'set', path: ['display', 'thresholdWarnPercent'], value: 61 }]])
})

test('Reset discards staged text while focused, including partial empty input, without a Host write', async context => {
  const { renderer, writes } = await page(context)
  const input = () => renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate('thresholdWarn'))!
  act(() => input().props.onChange({ target: { value: '' } }))
  assert.equal(input().props.value, '')
  assert.equal(button(renderer, 'Save settings').props.disabled, false)
  act(() => button(renderer, 'Reset').props.onClick())
  assert.equal(input().props.value, '80')
  assert.equal(button(renderer, 'Save settings').props.disabled, true)
  assert.equal(button(renderer, 'Reset').props.disabled, true)
  assert.deepEqual(writes, [])
})

test('pending settings Save disables all configuration edits and Reset and coalesces repeated events', async context => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const { renderer, writes } = await page(context, { mutation: async () => { await gate; return true } })
  act(() => mode(renderer).props.onChange({ target: { value: 'api' } }))
  try {
    await act(async () => {
      const save = button(renderer, 'Save settings').props.onClick
      save(); save()
      await flush()
    })
    assert.equal(writes.length, 1)
    assert.equal(button(renderer, 'Saving…').props.disabled, true)
    assert.equal(button(renderer, 'Reset').props.disabled, true)
    assert.equal(mode(renderer).props.disabled, true)
    assert.equal(renderer.root.findByProps({ role: 'switch' }).props.disabled, true)
    for (const input of renderer.root.findAllByType('input').filter(node => node.props.type !== 'password')) assert.equal(input.props.disabled, true)
    act(() => { mode(renderer).props.onChange({ target: { value: 'hidden' } }); button(renderer, 'Reset').props.onClick() })
    assert.equal(mode(renderer).props.value, 'api')
  } finally {
    await act(async () => { release(); await flush() })
  }
  assert.equal(button(renderer, 'Save settings').props.disabled, true)
  assert.equal(mode(renderer).props.disabled, false)
})

test('a dirty page shows external conflicts without rebasing and Reset adopts the latest accepted state', async context => {
  const { renderer, publish, writes, revisions } = await page(context)
  act(() => mode(renderer).props.onChange({ target: { value: 'api' } }))
  act(() => publish({ providers: { deepseek: { mode: 'hidden' } } }))
  assert.equal(mode(renderer).props.value, 'api')
  assert.match(text(renderer), /Settings changed elsewhere/)
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  assert.equal(mode(renderer).props.value, 'api')
  assert.match(text(renderer), /Could not save settings/)
  assert.deepEqual(revisions, [1])
  assert.deepEqual(writes, [[{ op: 'set', path: ['providers', 'deepseek', 'mode'], value: 'api' }]])
  act(() => button(renderer, 'Reset').props.onClick())
  assert.equal(mode(renderer).props.value, 'hidden')
  assert.doesNotMatch(text(renderer), /Settings changed elsewhere|Could not save settings/)
})

for (const field of ['mode', 'sourceId', 'baseUrl', 'apiKeyRef']) {
  test(`unsaved ${field} routing prevents immediate credential writes until Reset or accepted configuration`, async context => {
    const saved: string[] = []
    const cleared: string[] = []
    const { renderer, writes } = await page(context, { credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async ref => { saved.push(ref); return { ok: true, value: undefined } },
      unset: async ref => { cleared.push(ref); return { ok: true, value: undefined } },
    } })
    act(() => password(renderer).props.onChange({ target: { value: 'test-key' } }))
    act(() => {
      if (field === 'mode') mode(renderer).props.onChange({ target: { value: 'api' } })
      else if (field === 'sourceId') renderer.root.findAllByType('select').find(node => node.props['aria-label'] === 'Source')!.props.onChange({ target: { value: 'zai' } })
      else renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate(field === 'baseUrl' ? 'baseUrl' : 'apiKeyRef'))!.props.onChange({ target: { value: field === 'baseUrl' ? 'https://override.example' : 'NEW_KEY' } })
    })
    assert.equal(password(renderer).props.disabled, true)
    assert.equal(button(renderer, 'Save key now').props.disabled, true)
    assert.equal(button(renderer, 'Clear key now').props.disabled, true)
    assert.match(text(renderer), /Save settings before editing its key/)
    await act(async () => { button(renderer, 'Save key now').props.onClick(); button(renderer, 'Clear key now').props.onClick(); await flush() })
    assert.deepEqual(saved, [])
    assert.deepEqual(cleared, [])
    assert.deepEqual(writes, [])
    act(() => button(renderer, 'Reset').props.onClick())
    assert.equal(password(renderer).props.disabled, false)
    await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
    assert.deepEqual(saved, ['DEEPSEEK_API_KEY'])
    assert.deepEqual(writes, [])
  })
}

test('unrelated display drafts do not block immediate key writes and Reset does not undo them', async context => {
  let saves = 0
  const { renderer, writes } = await page(context, { credentials: {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => { saves++; return { ok: true, value: undefined } },
    unset: async () => ({ ok: true, value: undefined }),
  } })
  act(() => renderer.root.findByProps({ role: 'switch' }).props.onClick())
  assert.equal(password(renderer).props.disabled, false)
  act(() => password(renderer).props.onChange({ target: { value: 'test-key' } }))
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.equal(saves, 1)
  assert.equal(button(renderer, 'Save settings').props.disabled, false)
  assert.deepEqual(writes, [])
  act(() => button(renderer, 'Reset').props.onClick())
  assert.equal(saves, 1)
  assert.match(text(renderer), /Reset does not undo key changes/)
})

test('external source routing changes also block old draft credential targets even when provider fields are unchanged', async context => {
  let saves = 0
  const { renderer, publish } = await page(context, { credentials: {
    describe: async () => ({ ok: true, value: {} }),
    set: async () => { saves++; return { ok: true, value: undefined } },
    unset: async () => ({ ok: true, value: undefined }),
  } })
  act(() => renderer.root.findByProps({ role: 'switch' }).props.onClick())
  act(() => password(renderer).props.onChange({ target: { value: 'test-key' } }))
  act(() => publish({ sources: { deepseek: { apiKeyRef: 'LATEST_KEY' } } }))
  assert.equal(password(renderer).props.disabled, true)
  assert.match(text(renderer), /Save settings before editing its key/)
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.equal(saves, 0)
})

test('missing or mismatched credential metadata fails closed without labelling unknown permissions as locked', async context => {
  for (const value of [{}, { providers: { deepseek: { mode: 'api', apiKeyRef: 'UNKNOWN_KEY' } } }]) {
    let saves = 0
    const { renderer, store } = await page(context, { value, credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => { saves++; return { ok: true, value: undefined } },
      unset: async () => ({ ok: true, value: undefined }),
    } })
    if (!('providers' in value)) act(() => store.invalidate())
    assert.equal(password(renderer).props.disabled, true)
    assert.equal(button(renderer, 'Clear key now').props.disabled, true)
    assert.match(text(renderer), /Checking credential permissions/)
    assert.doesNotMatch(text(renderer), /This credential source cannot be edited here/)
    act(() => password(renderer).props.onChange({ target: { value: 'test-key' } }))
    await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
    assert.equal(saves, 0)
  }
})

test('read-only configuration disables provider edits without changing credential permissions', async context => {
  const { renderer, writes } = await page(context, { writable: false })

  assert.equal(mode(renderer).props.disabled, true)
  assert.equal(renderer.root.findByProps({ role: 'switch' }).props.disabled, true)
  assert.equal(password(renderer).props.disabled, false)
  await act(async () => { mode(renderer).props.onChange({ target: { value: 'hidden' } }); await flush() })
  assert.deepEqual(writes, [])
})

const ADMIN_PAGE = {
  catalog: [{ id: 'openai', displayName: 'OpenAI', modes: ['admin'], requiresBaseUrl: false,
    defaultBaseUrl: {}, credentialRefs: {}, unavailable: { reason: 'openai-public-api', billingUrl: 'https://platform.openai.com/settings/organization/billing/overview' } }] as SourceCatalog,
  groups: [{ id: 'openai', name: 'OpenAI', models: [{ id: 'm', name: 'Model' }] }],
}

function adminRef(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findAllByType('input').find(node => node.props['aria-label'] === translate('adminKeyRef'))!
}

test('invalid credential names show the DSH grammar and cannot save settings or keys', async context => {
  for (const admin of [false, true]) {
    const provider = admin ? 'openai' : 'deepseek'
    const field = admin ? 'adminKeyRef' : 'apiKeyRef'
    const ref = admin ? 'ORG_ADMIN' : 'DEEPSEEK_API_KEY'
    const saved: string[] = []
    const cleared: string[] = []
    const { renderer, writes } = await page(context, {
      ...(admin ? ADMIN_PAGE : {}),
      groups: [{ id: provider, name: provider, models: [{ id: 'm', name: 'Model' }] }],
      value: { providers: { [provider]: { mode: admin ? 'admin' : 'api', [field]: ref } } },
      report: { credentials: { [`${provider}:${admin ? 'admin' : 'api'}`]: {
        configured: true, ref, writable: true, candidates: [{ ref, configured: true, writable: true }],
      } } },
      credentials: {
        describe: async () => ({ ok: true, value: {} }),
        set: async ref => { saved.push(ref); return { ok: true, value: undefined } },
        unset: async ref => { cleared.push(ref); return { ok: true, value: undefined } },
      },
    })
    const refInput = () => renderer.root.findByProps({ 'data-usage-provider': provider }).findAllByType('input')
      .find(node => node.props['aria-label'] === translate(admin ? 'adminKeyRef' : 'apiKeyRef'))!
    for (const invalid of ['oai-usage-readonly', '1ADMIN', 'ADMIN KEY', 'ADMIN.KEY', '管理密钥']) {
      act(() => refInput().props.onChange({ target: { value: invalid } }))
      assert.equal(refInput().props['aria-invalid'], true)
      assert.match(text(renderer), /Credential names must start with a letter or underscore/)
      assert.doesNotMatch(text(renderer), /Checking credential permissions/)
      assert.equal(button(renderer, 'Save settings').props.disabled, true)
      assert.equal(password(renderer).props.disabled, true)
      await act(async () => {
        button(renderer, 'Save settings').props.onClick()
        button(renderer, 'Save key now').props.onClick()
        button(renderer, 'Clear key now').props.onClick()
        await flush()
      })
    }
    assert.deepEqual(writes, [])
    assert.deepEqual(saved, [])
    assert.deepEqual(cleared, [])
    act(() => button(renderer, 'Reset').props.onClick())
    assert.equal(refInput().props.value, ref)
    assert.equal(refInput().props['aria-invalid'], false)
    assert.equal(password(renderer).props.disabled, false)
    act(() => refInput().props.onChange({ target: { value: '_oai_usage_readonly2' } }))
    assert.equal(refInput().props['aria-invalid'], false)
    assert.equal(button(renderer, 'Save settings').props.disabled, false)
    await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
    assert.deepEqual(writes, [[{ op: 'set', path: ['providers', provider, field], value: '_oai_usage_readonly2' }]])
  }
})

test('a previously saved invalid ref cannot write even if credential metadata says writable', async context => {
  let writes = 0
  const ref = 'oai-usage-readonly'
  const { renderer } = await page(context, {
    ...ADMIN_PAGE,
    value: { providers: { openai: { mode: 'admin', adminKeyRef: ref } } },
    report: { credentials: { 'openai:admin': { configured: true, ref, writable: true,
      candidates: [{ ref, configured: true, writable: true }] } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => { writes++; return { ok: true, value: undefined } },
      unset: async () => { writes++; return { ok: true, value: undefined } },
    },
  })
  assert.equal(password(renderer).props.disabled, true)
  assert.match(text(renderer), /Credential names must start with a letter or underscore/)
  act(() => password(renderer).props.onChange({ target: { value: 'fake-admin-key' } }))
  await act(async () => {
    button(renderer, 'Save key now').props.onClick()
    button(renderer, 'Clear key now').props.onClick()
    await flush()
  })
  assert.equal(writes, 0)
})

test('an Admin key target cannot be inferred from ordinary refs or writable credential descriptors', async context => {
  let saves = 0
  const { renderer, writes, form, store } = await page(context, {
    ...ADMIN_PAGE,
    value: { providers: { openai: { mode: 'admin', apiKeyRef: 'INFERENCE_KEY' } } },
    report: { credentials: { 'openai:admin': { configured: false, ref: 'INFERRED_ADMIN', writable: true,
      candidates: [{ ref: 'INFERRED_ADMIN', configured: false, writable: true }] } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => { saves++; return { ok: true, value: undefined } },
      unset: async () => ({ ok: true, value: undefined }),
    },
  })
  assert.equal(renderer.root.findAllByType('input').filter(node => node.props.type === 'password').length, 0)
  assert.match(text(renderer), /Enter a dedicated Admin credential name and save settings before pasting/)
  act(() => adminRef(renderer).props.onChange({ target: { value: 'ORG_ADMIN' } }))
  assert.equal(password(renderer).props.disabled, true)
  assert.match(text(renderer), /Save settings before editing its key/)
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.equal(saves, 0)
  assert.deepEqual(writes, [])
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush(); await store.refreshCredentials() })
  assert.equal(form.getSnapshot().value.providers.openai?.adminKeyRef, 'ORG_ADMIN')
  assert.deepEqual(writes, [[{ op: 'set', path: ['providers', 'openai', 'adminKeyRef'], value: 'ORG_ADMIN' }]])
  assert.equal(password(renderer).props.disabled, true, 'the inferred descriptor cannot grant permission for the explicit ref')
  assert.match(text(renderer), /Checking credential permissions/)
})

test('Admin ref drafts block key writes, Reset restores the target, and a saved new target cannot inherit a masked key', async context => {
  const saved: Array<{ ref: string; value: string }> = []
  const cleared: string[] = []
  const report: CredentialReport = { credentials: { 'openai:admin': { configured: true, ref: 'ADMIN_A', writable: true,
    candidates: [{ ref: 'ADMIN_A', configured: true, writable: true }, { ref: 'ADMIN_B', configured: false, writable: true }] } } }
  const { renderer, writes, form, store } = await page(context, {
    ...ADMIN_PAGE,
    value: { providers: { openai: { mode: 'admin', adminKeyRef: 'ADMIN_A', apiKeyRef: 'INFERENCE_KEY' } } }, report,
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async (ref, value) => { saved.push({ ref, value }); return { ok: true, value: undefined } },
      unset: async ref => { cleared.push(ref); return { ok: true, value: undefined } },
    },
  })
  act(() => password(renderer).props.onChange({ target: { value: 'admin-a-test-secret' } }))
  act(() => adminRef(renderer).props.onChange({ target: { value: 'ADMIN_B' } }))
  assert.equal(password(renderer).props.value, '')
  assert.equal(password(renderer).props.disabled, true)
  await act(async () => { button(renderer, 'Save key now').props.onClick(); button(renderer, 'Clear key now').props.onClick(); await flush() })
  assert.deepEqual(saved, [])
  assert.deepEqual(cleared, [])
  act(() => button(renderer, 'Reset').props.onClick())
  assert.equal(adminRef(renderer).props.value, 'ADMIN_A')
  assert.equal(password(renderer).props.value, 'admin-a-test-secret')
  assert.equal(password(renderer).props.disabled, false)
  assert.deepEqual(writes, [])
  act(() => adminRef(renderer).props.onChange({ target: { value: 'ADMIN_B' } }))
  await act(async () => { button(renderer, 'Save settings').props.onClick(); await flush() })
  report.credentials['openai:admin'] = { configured: false, ref: 'ADMIN_B', writable: true,
    candidates: [{ ref: 'ADMIN_B', configured: false, writable: true }] }
  await act(async () => { await store.refreshCredentials() })
  assert.equal(form.getSnapshot().value.providers.openai?.adminKeyRef, 'ADMIN_B')
  assert.equal(form.getSnapshot().value.providers.openai?.apiKeyRef, 'INFERENCE_KEY')
  assert.equal(password(renderer).props.value, '')
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.deepEqual(saved, [])
  act(() => password(renderer).props.onChange({ target: { value: 'admin-b-test-secret' } }))
  await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
  assert.deepEqual(saved, [{ ref: 'ADMIN_B', value: 'admin-b-test-secret' }])
  assert.deepEqual(writes, [[{ op: 'set', path: ['providers', 'openai', 'adminKeyRef'], value: 'ADMIN_B' }]])
})

for (const writable of [undefined, false, true]) {
  test(`Admin credential permission ${String(writable)} is independent of read-only configuration and fails closed`, async context => {
    const saved: string[] = []
    const cleared: string[] = []
    const { renderer, writes } = await page(context, {
      ...ADMIN_PAGE, writable: false,
      value: { providers: { openai: { mode: 'admin', adminKeyRef: 'ORG_ADMIN' } } },
      report: { credentials: { 'openai:admin': { configured: true, ref: 'ORG_ADMIN', writable,
        candidates: [{ ref: 'ORG_ADMIN', configured: true, writable }] } } },
      credentials: {
        describe: async () => ({ ok: true, value: {} }),
        set: async ref => { saved.push(ref); return { ok: true, value: undefined } },
        unset: async ref => { cleared.push(ref); return { ok: true, value: undefined } },
      },
    })
    assert.equal(adminRef(renderer).props.disabled, true)
    assert.equal(password(renderer).props.disabled, writable !== true)
    act(() => password(renderer).props.onChange({ target: { value: 'admin-test-secret' } }))
    await act(async () => { button(renderer, 'Save key now').props.onClick(); await flush() })
    await act(async () => { button(renderer, 'Clear key now').props.onClick(); await flush() })
    assert.deepEqual(saved, writable === true ? ['ORG_ADMIN'] : [])
    assert.deepEqual(cleared, writable === true ? ['ORG_ADMIN'] : [])
    assert.deepEqual(writes, [])
  })
}

test('pending Admin credential writes coalesce events and display Reset does not undo immediate key writes', async context => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const saved: string[] = []
  const cleared: string[] = []
  const { renderer, writes } = await page(context, {
    ...ADMIN_PAGE,
    value: { providers: { openai: { mode: 'admin', adminKeyRef: 'ORG_ADMIN' } } },
    report: { credentials: { 'openai:admin': { configured: true, ref: 'ORG_ADMIN', writable: true,
      candidates: [{ ref: 'ORG_ADMIN', configured: true, writable: true }] } } },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async ref => { saved.push(ref); await gate; return { ok: true, value: undefined } },
      unset: async ref => { cleared.push(ref); return { ok: true, value: undefined } },
    },
  })
  act(() => renderer.root.findByProps({ role: 'switch' }).props.onClick())
  assert.equal(password(renderer).props.disabled, false)
  act(() => password(renderer).props.onChange({ target: { value: 'admin-test-secret' } }))
  try {
    await act(async () => {
      const save = button(renderer, 'Save key now').props.onClick
      save(); save(); button(renderer, 'Clear key now').props.onClick(); await flush()
    })
    assert.equal(password(renderer).props.disabled, true)
    assert.equal(button(renderer, 'Save key now').props.disabled, true)
    assert.equal(button(renderer, 'Clear key now').props.disabled, true)
    assert.deepEqual(saved, ['ORG_ADMIN'])
    assert.deepEqual(cleared, [])
    act(() => button(renderer, 'Reset').props.onClick())
    assert.deepEqual(writes, [])
  } finally {
    await act(async () => { release(); await flush() })
  }
  assert.equal(password(renderer).props.value, '')
  assert.equal(password(renderer).props.disabled, false)
  assert.match(text(renderer), /Reset does not undo key changes/)
  assert.deepEqual(saved, ['ORG_ADMIN'])
})

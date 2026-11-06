import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { act, create } from 'react-test-renderer'

import { useSettingsDraft } from '../../src/client/settings-draft.ts'
import { usageStateSettings } from '../../src/client/settings-form.ts'
import type { SettingsPathOp } from '../../src/client/context.ts'

async function draftPage(context: { after(callback: () => void): unknown }, options: {
  value?: Record<string, unknown>
  mutation?: () => Promise<boolean>
} = {}) {
  const listeners = new Set<() => void>()
  let snapshot = { status: 'ready' as const, value: options.value ?? {}, revision: 7, writable: true, mode: 'host' as const }
  const writes: Array<{ ops: readonly SettingsPathOp[]; revision?: number }> = []
  const publish = (value: Record<string, unknown>) => {
    snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }
    for (const listener of listeners) listener()
  }
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async () => true,
    unset: async () => true,
    mutate: async (ops: readonly SettingsPathOp[], revision?: number) => {
      writes.push({ ops: structuredClone(ops), revision })
      if (options.mutation !== undefined && !await options.mutation()) return false
      if (revision !== snapshot.revision) return false
      const next = structuredClone(snapshot.value)
      for (const op of ops) {
        let parent = next
        for (const field of op.path.slice(0, -1)) {
          parent[field] ??= {}
          parent = parent[field] as Record<string, unknown>
        }
        const field = op.path.at(-1)!
        if (op.op === 'unset') delete parent[field]
        else parent[field] = op.value
      }
      publish(next)
      return true
    },
  }
  const settings = usageStateSettings(form)
  let draft!: ReturnType<typeof useSettingsDraft>
  function Page() { draft = useSettingsDraft(settings); return null }
  let renderer!: ReturnType<typeof create>
  act(() => { renderer = create(h(Page)) })
  context.after(() => { act(() => renderer.unmount()) })
  return { get draft() { return draft }, writes, publish, form, renderer }
}

const warn = (value: number): SettingsPathOp => ({ op: 'set', path: ['display', 'thresholdWarnPercent'], value })

test('saving an edit to a legacy model preserves its provider routing and display order', async context => {
  const models = [
    { provider: 'other-route', model: 'other-model', sourceId: 'kimi', mode: 'coding-plan' },
    { provider: 'custom-route', model: 'custom-model', sourceId: 'deepseek', mode: 'api' },
  ]
  const page = await draftPage(context, { value: { models, future: { keep: true } } })
  act(() => page.draft.stage([{ op: 'set', path: ['providers', 'custom-route', 'apiKeyRef'], value: 'CUSTOM_KEY' }]))
  assert.deepEqual(page.draft.config.providers['custom-route'], { mode: 'api', sourceId: 'deepseek', apiKeyRef: 'CUSTOM_KEY' })
  assert.equal(page.writes.length, 0)

  await act(async () => { await page.draft.save() })

  assert.equal(page.draft.dirty, false)
  assert.deepEqual(page.draft.config.providers['custom-route'], { mode: 'api', sourceId: 'deepseek', apiKeyRef: 'CUSTOM_KEY' })
  assert.deepEqual(page.draft.config.order, ['other-route', 'custom-route'])
  assert.deepEqual(page.form.getSnapshot().value.models, models)
  assert.deepEqual(page.form.getSnapshot().value.future, { keep: true })
  assert.equal(page.writes.length, 1)
  assert.equal(page.writes[0]?.revision, 7)
})

test('configuration edits stage locally and Save atomically writes narrow paths at the first-edit revision', async context => {
  const page = await draftPage(context, { value: { future: { keep: true }, providers: { deepseek: { future: 'keep' } } } })
  act(() => {
    page.draft.stage([warn(60)])
    page.draft.stage([{ op: 'set', path: ['providers', 'deepseek', 'mode'], value: 'hidden' }])
  })
  assert.equal(page.draft.config.display.thresholdWarnPercent, 60)
  assert.equal(page.draft.config.providers.deepseek?.mode, 'hidden')
  assert.equal(page.draft.dirty, true)
  assert.deepEqual(page.writes, [])
  await act(async () => { await page.draft.save() })
  assert.deepEqual(page.writes, [{ ops: [warn(60), { op: 'set', path: ['providers', 'deepseek', 'mode'], value: 'hidden' }], revision: 7 }])
  assert.equal(page.draft.dirty, false)
  assert.equal(page.draft.error, undefined)
  assert.deepEqual(page.form.getSnapshot().value, {
    future: { keep: true }, providers: { deepseek: { future: 'keep', mode: 'hidden' } }, display: { thresholdWarnPercent: 60 },
  })
})

test('external snapshots never silently rebase a dirty draft; refused stale Save retains its original revision', async context => {
  const page = await draftPage(context)
  act(() => page.draft.stage([warn(60)]))
  act(() => page.publish({ display: { thresholdWarnPercent: 70 } }))
  assert.equal(page.draft.config.display.thresholdWarnPercent, 60)
  assert.equal(page.draft.stale, true)
  await act(async () => { await page.draft.save() })
  assert.equal(page.draft.dirty, true)
  assert.match(page.draft.error ?? '', /did not accept/)
  assert.equal(page.writes[0]?.revision, 7)
  await act(async () => { await page.draft.save() })
  assert.equal(page.writes[1]?.revision, 7)
  act(() => page.draft.reset())
  assert.equal(page.draft.config.display.thresholdWarnPercent, 70)
  assert.equal(page.draft.dirty, false)
  assert.equal(page.draft.stale, false)
  assert.equal(page.draft.error, undefined)
})

test('rejected and throwing writes retain staged values and operations for retry', async context => {
  for (const mutation of [async () => false, async (): Promise<boolean> => { throw new Error('offline') }]) {
    const page = await draftPage(context, { mutation })
    act(() => page.draft.stage([warn(61)]))
    await act(async () => { await page.draft.save() })
    assert.equal(page.draft.config.display.thresholdWarnPercent, 61)
    assert.equal(page.draft.dirty, true)
    assert.equal(page.draft.pending, false)
    assert.ok(page.draft.error)
    await act(async () => { await page.draft.save() })
    assert.deepEqual(page.writes.map(write => write.ops), [[warn(61)], [warn(61)]])
  }
})

test('pending Save coalesces repeated calls and prevents edits or Reset', async context => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const page = await draftPage(context, { mutation: async () => { await gate; return true } })
  act(() => page.draft.stage([warn(62)]))
  let save!: Promise<void>
  act(() => { save = page.draft.save(); void page.draft.save() })
  assert.equal(page.draft.pending, true)
  act(() => { page.draft.stage([warn(63)]); page.draft.reset() })
  assert.equal(page.draft.config.display.thresholdWarnPercent, 62)
  assert.equal(page.writes.length, 1)
  await act(async () => { release(); await save })
  assert.equal(page.draft.pending, false)
  assert.equal(page.draft.dirty, false)
})

test('Reset and unmount discard drafts without a write; pristine pages follow external changes', async context => {
  const page = await draftPage(context)
  act(() => page.publish({ display: { thresholdWarnPercent: 71 } }))
  assert.equal(page.draft.config.display.thresholdWarnPercent, 71)
  act(() => page.draft.stage([warn(64)]))
  act(() => page.draft.reset())
  assert.equal(page.draft.config.display.thresholdWarnPercent, 71)
  act(() => page.draft.stage([warn(65)]))
  act(() => page.renderer.unmount())
  assert.deepEqual(page.writes, [])
})

test('staged set/unset paths compose without normalizing away intermediate edits', async context => {
  const page = await draftPage(context, { value: { providers: { deepseek: { mode: 'api', apiKeyRef: 'OLD' } } } })
  act(() => {
    page.draft.stage([warn(96)])
    page.draft.stage([{ op: 'set', path: ['display', 'thresholdCriticalPercent'], value: 99 }])
    page.draft.stage([{ op: 'unset', path: ['providers', 'deepseek', 'apiKeyRef'] }])
  })
  assert.equal(page.draft.config.display.thresholdWarnPercent, 96)
  assert.equal(page.draft.config.display.thresholdCriticalPercent, 99)
  assert.equal(page.draft.config.providers.deepseek?.apiKeyRef, undefined)
  assert.deepEqual(page.writes, [])
})

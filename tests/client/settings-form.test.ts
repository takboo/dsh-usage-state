import test from 'node:test'
import assert from 'node:assert/strict'

import { usageStateSettings } from '../../src/client/settings-form.ts'
import { DEFAULT_CONFIG, type UsageStateConfig } from '../../src/shared/config.ts'
import type { ConfigFormLike, ConfigFormSnapshotLike, SettingsPathOp } from '../../src/client/context.ts'

type Snapshot = ConfigFormSnapshotLike<unknown>

function formStub(
  initial: Snapshot,
): {
  form: ConfigFormLike<unknown>
  publish: (next: Snapshot) => void
  calls: Array<{ kind: string; args: unknown[] }>
  listeners: () => number
} {
  let current = initial
  let count = 0
  const listeners = new Set<() => void>()
  const calls: Array<{ kind: string; args: unknown[] }> = []
  return {
    form: {
      getSnapshot: () => current,
      subscribe: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set: async (field, value) => {
        calls.push({ kind: 'set', args: [field, value] })
        return true
      },
      unset: async field => {
        calls.push({ kind: 'unset', args: [field] })
        return true
      },
      mutate: async (ops, expectedRevision) => {
        calls.push({ kind: 'mutate', args: [ops, expectedRevision] })
        return true
      },
    },
    publish: next => {
      current = next
      for (const listener of listeners) listener()
    },
    calls,
    listeners: () => listeners.size,
  }
}

const ready = (value: unknown): Snapshot => ({ status: 'ready', value, revision: 3, writable: true, mode: 'host' })

test('the adapter decodes the stored section with the same lenient normalizer', () => {
  const { form } = formStub(ready({ display: { progressBar: false } }))
  const settings = usageStateSettings(form)

  const snapshot = settings.getSnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.revision, 3)
  assert.equal(snapshot.writable, true)
  assert.equal(snapshot.mode, 'host')
  assert.equal(snapshot.value?.display.progressBar, false)
  // A hand-edited document still resolves to a whole config.
  assert.equal(snapshot.value?.refresh.intervalMinutes, DEFAULT_CONFIG.refresh.intervalMinutes)
})

test('an answered namespace with no value still normalizes to defaults', () => {
  const { form } = formStub(ready({}))
  assert.deepEqual(usageStateSettings(form).getSnapshot().value, DEFAULT_CONFIG)
})

test('an unanswered namespace stays undefined so the status line stays silent', () => {
  const { form } = formStub({ status: 'loading', value: undefined, revision: undefined, writable: false, mode: 'host' })
  const snapshot = usageStateSettings(form).getSnapshot()

  assert.equal(snapshot.status, 'loading')
  assert.equal(snapshot.value, undefined)
})

test('getSnapshot keeps one reference until the platform publishes a new one', () => {
  // `useSettingsValue` stores whatever this returns, so a fresh object per call
  // would re-render on every parent render.
  const { form, publish } = formStub(ready({}))
  const settings = usageStateSettings(form)

  const first = settings.getSnapshot()
  assert.equal(settings.getSnapshot(), first)

  publish(ready({ display: { progressBar: false } }))
  const second = settings.getSnapshot()
  assert.notEqual(second, first)
  assert.equal(settings.getSnapshot(), second)
  assert.equal(second.value?.display.progressBar, false)
})

test('writes and subscriptions pass straight through to the platform form', async () => {
  const { form, calls, listeners } = formStub(ready({}))
  const settings = usageStateSettings(form)

  let notified = 0
  const dispose = settings.subscribe(() => {
    notified += 1
  })
  assert.equal(listeners(), 1)

  const ops: SettingsPathOp[] = [{ op: 'set', path: ['providers', 'zai', 'mode'], value: 'api' }]
  await settings.mutate(ops, 7)
  await settings.set('order', ['zai'])
  await settings.unset('sources')

  assert.deepEqual(calls, [
    { kind: 'mutate', args: [ops, 7] },
    { kind: 'set', args: ['order', ['zai']] },
    { kind: 'unset', args: ['sources'] },
  ])

  dispose()
  assert.equal(listeners(), 0)
  assert.equal(notified, 0)
})

test('the decoded type is the plugin config, not the platform snapshot', () => {
  const { form } = formStub(ready({ providers: { zai: { mode: 'api' } } }))
  const value: UsageStateConfig | undefined = usageStateSettings(form).getSnapshot().value
  assert.equal(value?.providers.zai?.mode, 'api')
})

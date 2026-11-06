import { useRef, useState } from 'react'

import { normalizeConfig, type UsageStateConfig } from '../shared/config.ts'
import type { SettingsPathOp, SettingsScopeLike } from './context.ts'
import { useSettingsValue } from './hooks.ts'

interface Draft {
  value: Record<string, unknown>
  ops: readonly SettingsPathOp[]
  revision: number
}

/** Page-local configuration edits. Only Save crosses the existing form seam. */
export function useSettingsDraft(settings: SettingsScopeLike<UsageStateConfig>) {
  const snapshot = useSettingsValue(settings)
  const [draft, setDraft] = useState<Draft | undefined>()
  const current = useRef(draft)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [resetKey, setResetKey] = useState(0)

  const replace = (next: Draft | undefined) => {
    current.current = next
    setDraft(next)
  }
  const stage = (ops: readonly SettingsPathOp[]) => {
    const accepted = settings.getSnapshot()
    if (busy.current || !accepted.writable || accepted.status !== 'ready' || accepted.revision === undefined || ops.length === 0) return
    const previous = current.current
    const value = structuredClone(previous?.value ?? accepted.value ?? {}) as Record<string, unknown>
    for (const op of ops) {
      let parent = value
      for (const field of op.path.slice(0, -1)) {
        const child = Object.hasOwn(parent, field) ? parent[field] : undefined
        const next = child !== null && typeof child === 'object' && !Array.isArray(child) ? child : {}
        Object.defineProperty(parent, field, { value: next, enumerable: true, writable: true, configurable: true })
        parent = next as Record<string, unknown>
      }
      const field = op.path.at(-1)
      if (field === undefined) continue
      if (op.op === 'unset') delete parent[field]
      else Object.defineProperty(parent, field, { value: structuredClone(op.value), enumerable: true, writable: true, configurable: true })
    }
    replace({ value, ops: [...(previous?.ops ?? []), ...structuredClone(ops)], revision: previous?.revision ?? accepted.revision })
    setError(undefined)
  }
  const reset = () => {
    if (busy.current) return
    replace(undefined)
    setError(undefined)
    setResetKey(key => key + 1)
  }
  const save = async () => {
    const submitted = current.current
    const accepted = settings.getSnapshot()
    if (busy.current || submitted === undefined || !accepted.writable || accepted.status !== 'ready') return
    busy.current = true
    setPending(true)
    setError(undefined)
    try {
      // Keep the original revision even after external publications: a stale
      // draft must be refused by the Host, not silently overwrite newer edits.
      await settings.mutate(submitted.ops, submitted.revision)
      replace(undefined)
      setResetKey(key => key + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return {
    snapshot,
    config: normalizeConfig(draft?.value ?? snapshot.value ?? {}),
    dirty: draft !== undefined,
    stale: draft !== undefined && snapshot.revision !== draft.revision,
    pending, error, resetKey,
    stage, save, reset,
  }
}

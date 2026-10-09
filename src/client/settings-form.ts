import { normalizeConfig, type UsageStateConfig } from '../shared/config.ts'
import type { ConfigFormLike, SettingsScopeLike, SettingsScopeSnapshotLike } from './context.ts'

async function requireAccepted(write: Promise<boolean>): Promise<void> {
  if (!await write) throw new Error('The host did not accept the settings write')
}

/**
 * Present one `configForms` entry as the settings scope the components consume.
 *
 * Two things the platform form does not do for us:
 *
 * - **Decoding.** The host hands the stored section through unchanged, because this
 *   plugin's schema declares no fields on purpose (see `host/settings.ts`). So
 *   `normalizeConfig` runs here, keeping the single lenient decoder the plugin has
 *   always had. A namespace the platform has not answered yet keeps `value`
 *   undefined, which is what makes the status line stay silent instead of drawing
 *   defaults the host never accepted.
 * - **Snapshot identity.** `useSettingsValue` stores whatever `getSnapshot()`
 *   returns, so a fresh object per call would re-render forever. The decoded
 *   snapshot is cached against the platform snapshot it came from.
 */
export function usageStateSettings(form: ConfigFormLike<unknown>): SettingsScopeLike<UsageStateConfig> {
  let source: unknown
  let decoded: SettingsScopeSnapshotLike<UsageStateConfig> | undefined

  const snapshot = (): SettingsScopeSnapshotLike<UsageStateConfig> => {
    const next = form.getSnapshot()
    if (decoded === undefined || next !== source) {
      source = next
      decoded = {
        status: next.status,
        value: next.value === undefined ? undefined : normalizeConfig(next.value),
        revision: next.revision,
        writable: next.writable,
        mode: next.mode,
      }
    }
    return decoded
  }

  return {
    getSnapshot: snapshot,
    subscribe: listener => form.subscribe(listener),
    set: async (field, value) => {
      await requireAccepted(form.set(field, value))
    },
    unset: async field => {
      await requireAccepted(form.unset(field))
    },
    mutate: async (ops, expectedRevision) => {
      await requireAccepted(form.mutate(ops, expectedRevision))
    },
  }
}

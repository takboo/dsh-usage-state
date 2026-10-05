import { createElement } from 'react'

import type { UsageStateConfig } from '../shared/config.ts'
import type { CredentialReport, RemoteResult, UsageStateView } from '../shared/rpc.ts'
import { CONTRIBUTION } from './contribution.ts'
import { SettingsSection } from './SettingsSection.tsx'
import { StatusLine } from './StatusLine.tsx'
import { en, LOCALE_NS, zh } from './locales.ts'
import { remoteService } from './remote.ts'
import { usageStateSettings } from './settings-form.ts'
import { STATUS_LINE_SLOTS } from './slots.ts'
import { UsageStateClientStore } from './store.ts'
import type { ClientContextLike, CredentialsRemoteLike, ModelCatalogLike, RemoteServiceLike, SettingsScopeLike } from './context.ts'

// `configForms` is the 0.2 settings transport (0.1's `settingsScope` no longer
// exists); `remote.session` carries the model catalog and `remote.credentials` the
// key store. All are platform-provided service names that must be declared here or
// they are undefined at call time.
export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.session', 'remote.credentials']

const USAGE_STATE_NS = 'usage-state'
const POLL_INTERVAL_MS = 30_000

export function apply(ctx: ClientContextLike): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-usage-state: dictionaries')
  const t = ctx.locale.bind(LOCALE_NS)

  // `configForms` keys its forms by profile entry id, so USAGE_STATE_NS has to be
  // the id of the row this plugin's bundle patch inserts. The platform form hands
  // the stored section through undecoded (its schema declares no fields), so the
  // adapter decodes with the same lenient normalizer as before.
  const settings: SettingsScopeLike<UsageStateConfig> = usageStateSettings(ctx.configForms.get(USAGE_STATE_NS))

  // `remote.usageState` is contributed by this plugin, so it can never be declared
  // in `inject` (it appears only after $mount); `ctx.get` is the inject-free read.
  const usageStateRemote = () => remoteService<RemoteServiceLike>(ctx, 'remote.usageState')

  const store = new UsageStateClientStore({
    getState: async force => {
      const service = usageStateRemote()
      if (service === undefined) return { ok: false, error: { message: 'remote not mounted' } }
      return service.getState(force)
    },
    describeCredentials: async () => {
      const service = usageStateRemote()
      if (service === undefined) return { ok: false, error: { message: 'remote not mounted' } }
      return service.describeCredentials()
    },
    modelCatalog: async () => {
      const session = remoteService<{ modelCatalog(): Promise<RemoteResult<ModelCatalogLike>> }>(ctx, 'remote.session')
      if (session === undefined) return { ok: false, error: { message: 'model catalog unavailable' } }
      return session.modelCatalog()
    },
  })

  // Mounting is asynchronous; the store stays empty (and the line stays quiet)
  // until the contribution is live, then fills on the first refresh.
  ctx.effect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    void ctx.remote.$mount(CONTRIBUTION).then(
      off => {
        if (cancelled) {
          off()
          return
        }
        dispose = off
        void store.refresh(false)
        // The settings page may have mounted before the contribution was live.
        void store.refreshModels()
        void store.refreshCredentials()
      },
      // A rejected mount is why the line has no readings at all, so it must never
      // be swallowed: log it, and record it as the store's error so the settings
      // page states the real cause instead of showing an empty page.
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('dsh-usage-state: remote contribution did not mount', error)
        store.failRemote(message)
      },
    )
    return () => {
      cancelled = true
      dispose?.()
    }
  }, 'dsh-usage-state: remote contribution')

  ctx.effect(() => {
    const timer = setInterval(() => {
      void store.refresh(false)
      // A model catalog lookup can lose a race at boot; keep trying until it lands
      // instead of showing an empty settings page forever.
      if (store.getSnapshot().models.length === 0) void store.refreshModels()
    }, POLL_INTERVAL_MS)

    const disposers = [
      // A finished turn is the moment the host refreshes, so pick it up at once.
      ctx.on('api-session/status', (...args) => {
        if (args[1] === false) void store.refresh(false)
      }),
      ctx.on('connection/reset', () => {
        void store.refresh(true)
      }),
      settings.subscribe(() => {
        void store.refresh(false)
      }),
    ]

    return () => {
      clearInterval(timer)
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-usage-state: refresh loop')

  const seat = () => ({ usageState: store, settings })

  // Mount points live as data (see slots.ts) so the choice stays testable: the
  // line has one home, the composer dock. Turn-scoped slots are deliberately not
  // used — a turn is the wrong axis for an account-level reading.
  for (const slot of STATUS_LINE_SLOTS) {
    ctx.slots.inject(slot.name, () =>
      ctx.slots.register(
        { name: slot.name, id: slot.id, order: slot.order, locale: slot.locale, inject: seat },
        (props: never) => createElement(StatusLine, props),
      ),
    )
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'usage-state',
        // After every official page (the platform's own sections use 15–100).
        order: 200,
        label: () => t('nav'),
        locale: LOCALE_NS,
        inject: () => ({ ...seat(), credentials: remoteService<CredentialsRemoteLike>(ctx, 'remote.credentials') }),
      },
      SettingsSection as never,
    ),
  )
}

export type { ModelCatalogLike, UsageStateView, CredentialReport }

import type { SourceCatalog } from '../shared/display.ts'
import type { CredentialDescription } from '../shared/rpc.ts'
import type { UsageSnapshot } from '../shared/types.ts'
import type { UsageStateClientState } from './store.ts'

/**
 * The slice of the client store the status line reads. Declared here so the
 * component does not depend on the store's full surface (and tests can pass a
 * literal).
 *
 * `status` and `error` belong to that slice because a failed RPC is a state the
 * line has to be able to name: without them, "the plugin never heard back from its
 * own host" is indistinguishable from "this source does not serve that mode".
 */
export interface UsageStateSnapshotSource {
  getSnapshot(): {
    status: 'idle' | 'loading' | 'ready' | 'error'
    error: string | undefined
    catalog: SourceCatalog
    endpointHints?: Record<string, string>
    snapshots: Record<string, UsageSnapshot>
    credentials: Record<string, CredentialDescription>
  }
  subscribe(listener: () => void): () => void
}

/**
 * What the settings page needs: the full client state (model catalog, error
 * fields) plus the refresh affordances. Declaring it structurally keeps the
 * components independent of the concrete store class.
 */
export interface UsageStateClientSource extends UsageStateSnapshotSource {
  getSnapshot(): UsageStateClientState
  invalidate(): void
  refresh(force?: boolean): Promise<void>
  refreshCredentials(): Promise<void>
  refreshModels(): Promise<void>
}

/**
 * The browser half of the Typert RPC contract.
 *
 * The Host face lives in `src/host/typert.ts`; this mirror exists because the
 * browser bundle must not carry zod, and it is the object `remote.$mount()` hands
 * to the platform's Typert registry.
 *
 * Every non-`src-json` codec needs a `create()` factory returning the validator
 * used to decode the wire value (`codec.create().parse(value)`). DSH 0.1.5 only
 * checked `mode` and `typeSymbol`, so this mirror shipped without `create()` and
 * mounted fine there; 0.2's client registry added the factory requirement and
 * rejected the whole contribution — silently, because the mount rejection used to
 * be swallowed. See `tests/client/contribution.test.ts`, which mounts this object
 * through the real registry so the contract cannot drift again.
 */

export interface StrictCodecLike {
  mode: 'strict'
  typeSymbol: string
  create(): { parse(value: unknown): unknown }
}

export interface DescriptorLike {
  id: string
  service: string
  namespace: string
  method: string
  invocation: { kind: 'direct' }
  parameters: ReadonlyArray<{
    name: string
    wire: string
    source: 'json'
    /** Only ever `true` here: the one parameter is optional but always passed. */
    acceptsUndefined?: true
    codec: StrictCodecLike
  }>
  result: { mode: 'src-json' }
}

export interface ContributionLike {
  package: string
  descriptors: ReadonlyArray<DescriptorLike>
}

/** Absent or boolean — the one parameter this plugin's RPC takes. */
const forceSchema = {
  parse: (value: unknown): unknown => (value === undefined ? undefined : value === true),
}

/**
 * A strict codec built without zod: `schema` is what the wire decodes through, and
 * `create()` is the factory the platform's registry calls to obtain it.
 */
const booleanOrUndefined: StrictCodecLike = {
  mode: 'strict',
  typeSymbol: 'dsh-usage-state#Force',
  create: () => forceSchema,
}

const srcJson = { mode: 'src-json' as const }

/** Must mirror `src/host/typert.ts`: the wire endpoint is `<namespace>/<method>`. */
export const CONTRIBUTION: ContributionLike = {
  package: 'dsh-usage-state',
  descriptors: [
    {
      id: 'dsh-usage-state#usageState/getState',
      service: 'usageState',
      namespace: 'usageState',
      method: 'getState',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'force', wire: 'force', source: 'json', acceptsUndefined: true, codec: booleanOrUndefined }],
      result: srcJson,
    },
    {
      id: 'dsh-usage-state#usageState/describeCredentials',
      service: 'usageState',
      namespace: 'usageState',
      method: 'describeCredentials',
      invocation: { kind: 'direct' },
      parameters: [],
      result: srcJson,
    },
  ],
}

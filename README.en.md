# dsh-usage-state

See your **account balance** or **coding-plan quota** at a glance in [DSH (DeepSeek Harness)](https://github.com/deepseek-ai) — on its own line above the composer input, as wide as the input card.

> 中文说明见 [README.md](README.md)。

```
its own line above the composer input:   z.ai / GLM · ◔ 5h 12% (4h0m) · ◔ 7d 59% (3d17h)
                             DeepSeek · ¥58.13
hover any segment:           Source DeepSeek · Mode API balance · Granted 0 · Topped up 58.13
```

## Features

- **Works with zero configuration**: the plugin figures out which data source and mode a provider needs, and reuses the API key DSH already has.
- **Configured per provider, not per model** — readings are account-level, so each provider gets one setting: `Auto` / `API` / `Coding Plan` / `Hidden`. The model list is informational.
- **One line, always visible**: its own line above the composer input (DSH 0.2 mounts it at `conversation.input.dock`, width-matched to the input card; the native stats row and context meter are left untouched, not replaced) — no hover, no click.
- **Never invents data**: a failed refresh keeps the last good value and marks it stale (`12m ago ⚠`); rejected keys, endpoint errors and network problems each get a readable reason.
- **Hover details**: source and mode, the window's absolute reset time, the granted/topped-up split of a balance, the failure reason with the provider's own message.
- **Bilingual** (zh / en), following the DSH locale setting.
- **Display only**: balances and quotas, nothing else — no cost accounting, pricing catalog, history or budgets.

## Install

**Requirements**: DSH `0.2.0-rc.2` or a later 0.2 release, Node ≥ 20, installed into the `web` profile. The package **ships the prebuilt `lib/`**, so installation has no build step.
**On the 0.1 line install `0.3.2` instead**: DSH 0.2 replaced the whole settings API (`settingsScope` / `settings.register` → `configForms` / the plugin's own `Config`), and the two share no surface, so `0.4.0` and up support the 0.2 line only (see revision 17 of [`docs/design-changelog.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-changelog.md)).

```bash
# 1) install (npm package)
dsh plugin --profile web add dsh-usage-state

# 2) restart DSH — the plugin's bundle patch is read at startup

# 3) remove
dsh plugin --profile web remove dsh-usage-state
```

Installing straight from GitHub works too (same content as the npm package):

```bash
dsh plugin --profile web add github:takboo/dsh-usage-state
```

For development, a local path works too (host-side changes still need a DSH restart):

```bash
dsh plugin --profile web add /path/to/dsh-usage-state
```

It is also listed in [dsh-market](https://github.com/dsh-market/dsh-market): search for `usage state` (or `takboo`) and install it in one click — the plugin is on the [awesome-dsh-plugin](https://awesome-dsh-plugin.com) curated list under Usage & Billing.

Nothing showing up after installing? See the troubleshooting table at the end of [`docs/adapters.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md).

## Quick start

1. Open **Settings → Usage state**: one row per provider configured in DSH.
2. Leave it on **Auto** (it detects the data source and its primary mode), or pick `API` / `Coding Plan` / `Hidden`; use ↑↓ to reorder.
3. The reading appears on its own line above the composer input, as wide as the input card.

If a source needs an endpoint or a key (a self-hosted Sub2API, or a provider without a credential yet), expand that row's **Advanced** block to override the source, set the endpoint, name the credential, or paste a key (written to the DSH credential store).

A very long provider name never pushes the controls around: the card header stays on one line and only the grey provider id is truncated (hover it for the full text).

## Screenshots

The reading on its own line above the composer (shown here with OpenCode Zen Go's three windows; the row under the card is DSH's own statistics, untouched by this plugin — hover any segment for source, mode and the absolute reset time):

![The reading on its own line above the composer](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/status-line.webp)

Settings: one row per provider; **Auto** detects the data source and its primary mode:

![Provider list in the settings page](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-providers.webp)

Expanding **Advanced** lets you override the source and endpoint, name a credential, or paste a key (written to the DSH credential store):

![Advanced block](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-advanced.webp)

## Supported sources

| Source | API mode | Coding-plan mode | Credential |
|---|---|---|---|
| DeepSeek official | balance (CNY / USD) | — (no coding plan) | `DEEPSEEK_API_KEY` |
| z.ai / Zhipu GLM | — | 5h / 7d used % | `ZAI_API_KEY` and friends |
| Kimi (China) | Moonshot pay-as-you-go balance | Kimi Code subscription windows | `MOONSHOT_API_KEY` / `KIMI_CODING_API_KEY` |
| OpenCode Zen Go | — | 5h / 7d / 30d used % | `OPENCODE_GO_API_KEY` / `OPENCODE_API_KEY` |
| Sub2API (self-hosted) | balance / key quota | 5h / 7d from `rate_limits[]` | `SUB2API_API_KEY` + instance URL |

- **z.ai is regional**: a coding-plan key only works on its own region (`open.bigmodel.cn` for China, `api.z.ai` globally). China is the default; the other host is tried as a mirror, and you can pin an endpoint in the settings.
- **OpenCode Zen Go** reads `rolling` / `weekly` / `monthly` from `opencode.ai/zen/go/v1/usage`. Both DSH routes into the same account (built-in `opencode-go` and the custom `opencode-go-deepseek`) produce one reading and one request. A missing subscription or a rejected key is reported as an auth failure, never as 0%.
- Other vendors (Claude Pro/Max, MiniMax, OpenRouter, Codex, Antigravity, Volcengine Ark, …) are not implemented, but the adapter contract and a candidate list are ready: see [`docs/adapters.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md).

## Display, refresh, credentials

- **Placement**: its own full-width line **above** the composer input, as wide as the input card (the `conversation.input.dock` slot on DSH 0.2). The line is always visible — it never depends on hover or a click — and wraps between segments on narrow windows instead of clipping.
- **Elements**: provider label · balance + currency · each window (5h / 7d / 30d): an SVG progress ring + used % + reset countdown · threshold colours (defaults: amber ≥80%, red ≥95%, configurable; the colour applies to the whole segment and carries into the ring).

The ring copies the geometry of the platform's own context meter (a 14×14 circle whose arc starts at twelve o'clock), replacing the earlier `█`/`░` text bar — a vector shape has no glyph metrics, so it cannot be inflated by font fallback; it can be turned off in the settings.
- **Semantics**: percentages are always *used*; balances only appear in API mode, and coding-plan mode shows the windows the source actually has (5h / 7d for z.ai and Sub2API, plus 30d for OpenCode Zen Go); a stale reading shows its age instead of hiding.
- **Refresh**: 2s after a turn ends, plus a 5-minute idle fallback; at most one real request per source per 60s, in-flight calls are shared, failures are not throttled.
- **Credentials**: override → the provider's declared `apiKeyEnv` → the source's built-in ref → DSH credential store. Keys are written to `~/.dsh/.credentials.yaml`; **this plugin never stores a plaintext key** and the browser never receives a key value.

## Compatibility

- **0.2 line only**: `engines.dsh` = `>=0.2.0-rc.2 <0.3.0-0` (this is what dsh-market's badge and install gate read). On an earlier host, install `0.3.2`.
- `peerDependencies` carry `@deepseek-ai/dsh-settings` (`^0.2.0-rc.2`) and `@deepseek-ai/schemastery` (`^3.18.2`). The first one is deliberate: the runtime install gate only reads `@deepseek-ai/dsh*` peers, so declaring it makes a 0.1.x host **refuse the install** instead of accepting it and then failing to boot. Both are platform-provided; pnpm may print a `missing peer` warning for them, which is expected.
- Version `0.4.4`: docs-only release — the README matches actual behaviour and `CHANGELOG.md` ships with the package; `lib/` is byte-identical to `0.4.3`.
- Version `0.4.3`: progress becomes the **platform-style SVG ring** (replacing the `█`/`░` text bar, with threshold colours carried onto the ring), typography copied from the platform stats row, and wraps no longer leave an orphaned `·` (revisions 21–23).
- Version `0.4.2` moves the status line to `conversation.input.dock`, giving it **its own line above the composer input** — DSH 0.2 turned the old below-the-input position into a shared row of pills next to the platform's stats and context meter (revisions 19/20).
- Version `0.4.1` fixes `0.4.0`'s missing readings: the browser half's RPC contribution lacked the `create()` factory 0.2 requires, so `remote.usageState` never mounted — the UI showed **no readings at all** and mislabelled the cause as `Mode not supported`. The same release stops swallowing a rejected mount, says "reading" while the catalog is absent, and adds **real 0.2 registry contract tests** (revision 18). **Use `0.4.1`, not `0.4.0`.**
- Version `0.4.0` migrates to the 0.2 settings model (`Config` + `configForms`, with cross-entry config read through `configEditor`). Changes: [CHANGELOG](CHANGELOG.md); verification: [`docs/release.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/release.md); rationale: [`docs/design-changelog.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-changelog.md) revision 17.
- Version `0.3.2` (last of the 0.1 line) only widened `engines.dsh`; **its claimed 0.2 compatibility was wrong** — on `0.2.0-rc.2` it fails the entire web boot because `settingsScope` does not exist there.
- Published to npm as [`dsh-usage-state`](https://www.npmjs.com/package/dsh-usage-state); GitHub installs work too.

## Limitations

- **Kimi and Sub2API are not verified against live accounts yet** (no credentials on the author's machine); their `/v1/usage` style endpoints are undocumented and parsed defensively.
- **The threshold colours (amber/red) have no real-machine sample yet**: implemented and pinned by tests, but live readings have stayed below the thresholds; set the amber threshold to 10 temporarily to see them.
- **Clicking the line does not open settings** (the platform exposes no public "open settings panel" service); details are in the hover tooltip.
- **Current reading only**: the line reports the account's latest value. The plugin keeps no per-turn and no per-time history, so scrolling back through old turns shows no "balance at that moment". Account history, if ever added, would be keyed by time rather than by turn — a separate decision.
- Full list: [`docs/backlog.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md).

## Development

```bash
npm install          # add --cache /tmp/npm-cache if ~/.npm is not writable
npm test             # node:test runs .ts / .tsx directly (needs Node >= 22.6)
npm run typecheck    # tsc --noEmit
npm run build        # tsdown → lib/ (host index.js + typert.js, browser client.js)
npm run watch        # rebuilds client.js only; client changes hot-reload, no page refresh
```

**Local loop (no release needed)**: `scripts/dev-local.sh` creates a throwaway profile under `/tmp/dsh-dev` (override with `DSH_HOME`), installs this repository into it as a `link:` and boots a host on its own port with the Desktop app's bundled CLI. Your real profiles are never touched.

```bash
npm run build                 # lib/ must exist
scripts/dev-local.sh          # creates/reuses the dev profile, prints the token URL
# second terminal:
npm run watch                 # rebuilds client.js on save
```

Because the profile links this working tree, a rebuild is picked up by the running host: client changes are hot-swapped by `dsh-client-hmr` (the host stat-polls every bundle at 500ms and tells the browser to reload the module over `/plugins/events`) — no restart, no release. Host-side changes (`src/host/**`, `src/index.ts`, `cordis.patch.yml`) need this script restarted.

⚠️ **This profile has no credentials**: `$DSH_HOME/.credentials.yaml` is home-level, and a fresh home starts without keys and without your other plugins (a font plugin changes the very glyph metrics a layout depends on). It is for **structural / host-side** checks only. To judge how something *looks*, install the same build into a profile that already has your keys and plugins — still without publishing:

```bash
npm pack --pack-destination /tmp --cache /tmp/npm-cache
dsh plugin --profile web add /tmp/dsh-usage-state-<version>.tgz   # file: install
dsh plugin --profile web add "$PWD"                               # link: install, for hot reload
dsh plugin --profile web add dsh-usage-state@<published>          # back to the published build
```

Bump the version and publish only after you have **seen** the change work.

Host-side changes need a DSH restart; client-side changes do not. The `lib/` output is **committed on purpose**: `dsh plugin add github:...` installs straight from the repository with no build step, and `npm test` guards the bundle envelope, the require allow-list and the `exports` targets.

## Docs

| Document | Contents |
|---|---|
| [CHANGELOG](CHANGELOG.md) | Changes per version |
| [`docs/architecture.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/architecture.md) | Code map, decision → code → test → verification traceability (Chinese) |
| [`docs/adapters.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md) | Adding a data source: contract, workflow, pitfalls, troubleshooting (Chinese) |
| [`docs/design-consensus.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-consensus.md) | The design as it currently stands (Chinese) |
| [`docs/design-changelog.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/design-changelog.md) | Design revision log: every decision change with its reasoning (Chinese) |
| [`docs/release.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/release.md) | Release process, end-to-end verification, acceptance checklist, market listing (Chinese) |
| [`docs/platform-notes.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/platform-notes.md) | Measured facts about DSH platform behaviour (Chinese) |
| [`docs/backlog.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md) | Backlog, candidate data sources, explicit non-goals (Chinese) |
| [`docs/research/README.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/research/README.md) | Read-only research index (vendor APIs, the replaced plugin, DSH RPC contract) |

## Acknowledgements

- **[`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter)** by Han-1413141 (MIT): this plugin is a **simplified replacement** for it. It keeps the "show me my balance / coding-plan quota" need and drops everything else — cost accounting, pricing catalog, history, budgets, peak/off-peak alerts.
  The data-source endpoints, the meaning of the response fields and several compatibility pitfalls (OpenCode Zen Go needs a browser UA, z.ai reports auth failure as HTTP 200 + `{success:false}`, the legacy `coding_plan/usage` fallback, sub2api's `rate_limits[]` shape, …) come from a **read-only analysis** of `dsh-cost-meter@1.7.28`, recorded in [`docs/research/dsh-cost-meter-analysis.md`](https://github.com/takboo/dsh-usage-state/blob/main/docs/research/dsh-cost-meter-analysis.md). The implementation here is independently written TypeScript rather than copied source, but those behaviours are upstream's work and credit belongs there.
  If the upstream author wants a clearer attribution or a different arrangement, open an issue and it will be fixed.
- **[DSH (DeepSeek Harness)](https://github.com/deepseek-ai)**: the host platform. The plugin relies on its settings namespace, credential store, Typert RPC, slot system and UI primitives (`@deepseek-ai/dsh-client-ui-primitives` and friends).

## License

[MIT](LICENSE)

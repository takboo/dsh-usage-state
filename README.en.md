# dsh-usage-state

[中文](README.md) | **English**

[![CI](https://github.com/takboo/dsh-usage-state/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/takboo/dsh-usage-state/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/dsh-usage-state)](https://www.npmjs.com/package/dsh-usage-state)

> **0.4.10** verifies DSH **0.2.1-rc.3** compatibility, including its dynamic model catalog, while retaining separate account sign-in and API Key balances. See the [GitHub Release](https://github.com/takboo/dsh-usage-state/releases/tag/v0.4.10) for the tarball and checksum and the [Changelog](CHANGELOG.md#0410---2026-10-24) for details.

Show the current model provider's **account balance** or **coding-plan quota** above the composer input in [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness). The line matches the input card's width and preserves the native statistics and context meter.

```text
z.ai / GLM · ◔ 5h 12% (4h0m) · ◔ 7d 59% (3d17h)
DeepSeek · ¥58.13
```

## Features

- Recognized providers default to Auto and reuse existing DSH credentials. Configuration is per provider; the model list is informational.
- Balances, used percentages, reset countdowns and SVG rings, with configurable amber/red thresholds (80%/95% by default) and an option to hide rings.
- A failed source request keeps the last successful reading for the same effective account identity, with its age and reason. An RPC failure also marks retained values as stale.
- Hover details include source, mode, reset time and balance components. The UI follows DSH's Chinese/English language setting.
- Current account readings only: no cost attribution, price catalog, budgets or historical bills.

## Install

Requires DSH matching `^0.2.0-rc.2 || ^0.2.1-rc.1` (verified on 0.2.0-rc.2 and 0.2.1-rc.1/rc.2/rc.3). The prebuilt plugin declares Node ≥20. Install into the `web` profile you actually use.

Install from npm:

```bash
dsh plugin --profile web add dsh-usage-state
# Restart DSH afterwards: the bundle patch is read at startup.
```

You can also install from GitHub:

```bash
dsh plugin --profile web add github:takboo/dsh-usage-state
```

This repository commits prebuilt artifacts for DSH's GitHub installation path. A floating Git branch may be ahead of npm; record the source and version/commit when reproducing an issue. This does not describe every npm Git installation's lifecycle.

You can also search for `usage state` or `takboo` in [dsh-market](https://github.com/dsh-market/dsh-market); check the actual installation source and version afterwards. The plugin is on the [curated list](https://awesome-dsh-plugin.com); catalog visibility depends on the selected region and a successful catalog build.

Use historical version 0.3.2 on DSH 0.1; it does not work on 0.2. Version 0.4.0 has a broken RPC mount, so upgrade to the **latest compatible release**. See the [Changelog](CHANGELOG.md) for version history.

## Quick start

1. Open **Settings → Usage state** to inspect providers, models and the detected source.
2. Keep Auto for recognized providers, or choose a supported API Key balance, Account balance, Coding Plan or Hidden option.
3. Set your instance URL for a self-hosted Sub2API source. The current model's reading appears above the input.
4. Use Refresh now for an explicit query. Check the settings error and the [troubleshooting guide (Chinese)](https://github.com/takboo/dsh-usage-state/blob/main/docs/troubleshooting.md) if it fails.

Advanced controls offer source selection; API Key mode also provides endpoint, credential name and key writes. Explicit provider overrides take precedence over legacy source defaults. Descriptions and requests share the candidate order; saves prioritize the explicit ref. Pinned endpoints do not try mirrors, and account configuration/key changes discard previous-identity readings. Configuration and credential write permissions are separate; saves/clears report failure and prevent repeated in-flight operations.

## Sources

| Source | Balance reading | Coding-plan reading | Main credential |
|---|---|---|---|
| DeepSeek official API Key | CNY/USD balance | — | DEEPSEEK_API_KEY |
| DeepSeek account sign-in | CNY/USD recharge and bonus balance | — | Current Harness login |
| z.ai / Zhipu GLM | — | 5h / 7d used % | ZAI_API_KEY and related refs |
| Kimi / Moonshot | CNY balance | Kimi Code subscription windows | MOONSHOT_API_KEY / KIMI_CODING_API_KEY |
| OpenCode Zen Go | — | 5h / 7d / 30d used % | OPENCODE_GO_API_KEY / OPENCODE_API_KEY |
| Sub2API | Balance or key allowance | Depends on the instance, e.g. 5h / 1d / 7d / 30d | SUB2API_API_KEY and instance URL |

**DeepSeek Desktop account sign-in:** `deepseek-account` automatically uses “Account balance” through the Harness account service, adding recharge and bonus wallets. `deepseek-official` uses “API Key balance”. Queries and caches are separate; account mode never probes or falls back to `DEEPSEEK_API_KEY`. Sign in through Harness account settings. Account mode requires the host account service; older hosts without it need an upgrade. Harness owns the endpoint and login grant; account mode has no API key fields.

Kimi Code routes `kimi-code`, `kimi-coding`, and `kimi-for-coding`, plus custom providers declaring `api.kimi.com` / `api.kimi.ai`, automatically read subscription usage. The plugin displays only returned windows: 5h, 7d, monthly total, and monthly code usage. Moonshot regional APIs retain CNY balance mode. Explicit settings take precedence.

Percentages mean **used**. z.ai keys belong to their China/global region; China is the default endpoint and failures may try the mirror. The current cache merges by source and mode, so separate keys/instances must not be treated as supported independent accounts. Endpoints, field semantics and extension steps are in the [adapter guide (Chinese)](https://github.com/takboo/dsh-usage-state/blob/main/docs/adapters.md).

## Screenshots

OpenCode Zen Go's three windows on the independent line above the input:

![Account readings above the input](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/status-line.webp)

Provider settings and advanced controls:

![Provider settings](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-providers.webp)

![Advanced settings](https://raw.githubusercontent.com/takboo/dsh-usage-state/main/assets/screenshots/settings-advanced.webp)

## Refresh and credentials

The host schedules refreshes 2 seconds after a turn ends and has a 5-minute fallback timer. The browser reads the RPC mirror every 30 seconds. Ordinary polling initializes a missing or changed account identity, otherwise it does not shorten idle queries to once a minute. Successful requests have a default 60-second minimum; explicit refresh can bypass it, and active retries after failure are not throttled by that successful-request interval. Editing the idle interval reschedules the timer.

The plugin queries balances/quotas and reads the selected model and provider catalog. It writes no session logs and reports no readings to third parties. The host does not return stored key values to the browser; a key the user actively pastes is sent through DSH's credential service to the credential file in the selected home. Credential precedence follows the host: DSH 0.2.1-rc.1/rc.2/rc.3 Web/Desktop prefers saved credentials, with environment values as fallback; 0.2.0-rc.2 prefers the environment. The settings page reflects the host’s actual write permissions.

## Known limitations

See the [Backlog (Chinese)](https://github.com/takboo/dsh-usage-state/blob/main/docs/backlog.md) for remediation status and verification scope.

- **Account scope:** one target is still selected per source and mode. Identity isolation does not add independent multi-account support.
- **Live verification:** this release’s real Desktop account login and visuals, Kimi Code monthly quotas, Sub2API accounts, high-threshold colors, real credential writes and nonzero OpenCode readings still lack live coverage. Local interaction tests do not replace that acceptance.
- **Scope:** the line can be absent without a selected model or when hidden; clicking it does not open settings; readings are not saved as history.

## Development and docs

Development supports Node 22.18+ on the 22 line or Node 24.11+. Canonical builds pin **Node 24.21.0** ([.node-version](https://github.com/takboo/dsh-usage-state/blob/main/.node-version)) and **npm 11.19.1** (packageManager), above the runtime floor. Basic checks:

```bash
npm ci
npm run typecheck
npm run build
npm test
```

See the [development guide (Chinese)](https://github.com/takboo/dsh-usage-state/blob/main/docs/development.md) for local profiles, watch and HMR requirements. The [documentation index (Chinese)](https://github.com/takboo/dsh-usage-state/blob/main/docs/index.md) links architecture, design, release, audit and research material by task.

## Acknowledgements and license

Thanks to [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) by Han-1413141 (MIT) for data-source behavior references. This TypeScript implementation was written independently; endpoint, field and compatibility provenance is recorded in the [upstream analysis](https://github.com/takboo/dsh-usage-state/blob/main/docs/archive/research/dsh-cost-meter-analysis.md). DSH provides the settings, credentials, RPC, slots and UI primitives.

[MIT](LICENSE). Report problems or attribution suggestions through [Issues](https://github.com/takboo/dsh-usage-state/issues).

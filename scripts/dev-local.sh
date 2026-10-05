#!/usr/bin/env bash
#
# Local development loop: run this plugin against a real host **without publishing**.
#
# Creates (once) a throwaway profile whose dependency is a `link:` to this repository,
# then boots a host on a spare port. Because the link points at the working tree, a
# rebuild of `lib/` is picked up by the running host:
#
#   - client half (`src/client/**`): `dsh-client-hmr` stat-polls every client bundle
#     (500ms) and pushes a reload over `/plugins/events`, so `npm run watch` in a
#     second terminal is enough — no restart, no reload needed in most cases.
#   - host half (`src/host/**`, `src/index.ts`, `cordis.patch.yml`): read at boot, so
#     restart this script.
#
# Your real profiles (`~/.dsh/profiles/{web,desktop}`) are never touched: everything
# lives under `$DSH_HOME` (default `/tmp/dsh-dev`), which the OS may clear on reboot.
#
# **What this profile does not have**: credentials. `$DSH_HOME/.credentials.yaml` is
# home-level, and a fresh home starts empty — so there are no API keys, no provider
# rows and none of your other plugins (a font plugin changes the very metrics a
# layout change depends on). This loop is therefore for **structural / host-side**
# checks. To judge how something *looks*, install the same build into a profile that
# already has your keys and plugins, without publishing:
#
#   npm pack --pack-destination /tmp --cache /tmp/npm-cache
#   dsh plugin --profile web add /tmp/dsh-usage-state-<version>.tgz   # file: install
#   # iterate with hot reload instead of one-shot installs:
#   dsh plugin --profile web add "$PWD"                               # link: install
#   # and to go back to the published build:
#   dsh plugin --profile web add dsh-usage-state@<published>
#
# Usage:
#   scripts/dev-local.sh                 # boot on 3099
#   PORT=3100 scripts/dev-local.sh       # another port
#   DSH_HOME=~/.dsh-dev scripts/dev-local.sh
#   DSH=/path/to/dsh scripts/dev-local.sh
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PROFILE=${PROFILE:-p}
PORT=${PORT:-3099}
DSH_HOME=${DSH_HOME:-/tmp/dsh-dev}
export DSH_HOME

# The bundled CLI ships the runtime the Desktop app uses (0.2.0-rc.2) *and* its own
# pnpm, so the dev profile is built with the same toolchain the app uses.
DSH=${DSH:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}
if [[ ! -x "$DSH" ]]; then
  if command -v dsh >/dev/null 2>&1; then
    DSH=$(command -v dsh)
  else
    echo "dev-local: no dsh CLI found; set DSH=/path/to/dsh" >&2
    exit 1
  fi
fi

mkdir -p "$DSH_HOME"
profile_dir="$DSH_HOME/profiles/$PROFILE"

if [[ ! -f "$profile_dir/package.json" ]]; then
  echo "dev-local: creating profile '$PROFILE' in $DSH_HOME"
  "$DSH" --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null
fi

# `link:` on purpose: the host then serves this working tree's `lib/` directly, which
# is what makes the watch loop work. (A link install resolves `@deepseek-ai/*` from
# this repository's own node_modules — a packed install resolves it through the
# platform's module fallback instead. See docs/implementation.md §9 item 5.)
if ! grep -q "dsh-usage-state" "$profile_dir/package.json"; then
  echo "dev-local: linking $ROOT into profile '$PROFILE'"
  "$DSH" plugin --profile "$PROFILE" add "$ROOT" >/dev/null
fi

if [[ ! -f "$ROOT/lib/client.js" ]]; then
  echo "dev-local: lib/ is missing; run \`npm run build\` first" >&2
  exit 1
fi

echo "dev-local: hosting profile '$PROFILE' on port $PORT"
echo "dev-local: client changes hot-reload — keep \`npm run watch\` in another terminal;"
echo "dev-local: host changes need this script restarted."
exec "$DSH" --profile "$PROFILE" --port "$PORT" --no-open

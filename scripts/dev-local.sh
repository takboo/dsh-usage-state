#!/usr/bin/env bash
#
# Local development loop: run this plugin against a real host **without publishing**.
#
# Creates (once) a throwaway profile whose dependency is a `link:` to this repository,
# then boots a host on a spare port. Because the link points at the working tree, a
# rebuild of `lib/` is picked up by the running host:
#
#   - client half: watch rebuilds the linked bundle. Hot replacement additionally
#     needs active host client-hmr transport and a connected browser receiver.
#   - host half (including typert and the patch): restart this script after rebuild.
#
# Everything lives under the explicitly selected DSH_HOME. The /tmp/dsh-dev
# default applies only when that variable is unset; never point it at a real home.
# A fresh home has its own credential file, but still inherits process environment
# keys. It also lacks your other plugins (fonts can change layout measurements).
# This loop is useful for structural checks; use an explicitly chosen validation
# environment to judge live account readings and appearance.
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

# Prefer the existing Desktop CLI and its bundled package manager when available.
# Record its actual version when checking compatibility.
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

# `link:` serves this working tree's lib directly. Dependency lookup depends on
# the installed host version and checkout path; a link can see devDependencies,
# so a release smoke must use the tarball. See docs/platform-notes.md.
if ! grep -q "dsh-usage-state" "$profile_dir/package.json"; then
  echo "dev-local: linking $ROOT into profile '$PROFILE'"
  "$DSH" plugin --profile "$PROFILE" add "$ROOT" >/dev/null
fi

if [[ ! -f "$ROOT/lib/client.js" ]]; then
  echo "dev-local: lib/ is missing; run \`npm run build\` first" >&2
  exit 1
fi

echo "dev-local: hosting profile '$PROFILE' on port $PORT"
echo "dev-local: client HMR needs an active host/browser channel; run \`npm run watch\` in another terminal;"
echo "dev-local: host changes need this script restarted."
exec "$DSH" --profile "$PROFILE" --port "$PORT" --no-open

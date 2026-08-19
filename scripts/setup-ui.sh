#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ui="$root/web-ui"
dsh_home="${DSH_HOME:-$HOME/.dsh}"

if [[ ! -f "$ui/package.json" ]]; then
  echo "缺少 Web UI submodule：$ui" >&2
  exit 1
fi

CI=true pnpm --dir "$ui" install --frozen-lockfile
pnpm --dir "$ui" build
node "$ui/scripts/link-profile.mjs"
bash "$root/scripts/dsh-plugin.sh" --profile web add "link:$ui/packages/dsh-web-ui-all"
CI=true corepack pnpm@11.7.0 --dir "$dsh_home/profiles/web" add "dsh-better-sidebar@0.13.0" --save-exact --allow-build=node-pty --allow-build=protobufjs

if [[ "$(node "$ui/scripts/dsh-skin" current)" == "none" ]]; then
  node "$ui/scripts/dsh-skin" use whale-song
fi

mkdir -p "$dsh_home"
touch "$dsh_home/settings.yaml"
if ! grep -q '^ui-theme:' "$dsh_home/settings.yaml"; then
  printf '\nui-theme:\n  preference: dark\n' >> "$dsh_home/settings.yaml"
fi

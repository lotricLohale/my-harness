#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ui="$root/web-ui"

git -C "$ui" fetch origin main --quiet
current="$(git -C "$ui" rev-parse HEAD)"
latest="$(git -C "$ui" rev-parse origin/main)"

printf 'current: %s\nlatest:  %s\n' "$current" "$latest"
if [[ "$current" == "$latest" ]]; then
  echo 'dsh-web-ui 已是最新版本。'
else
  echo 'dsh-web-ui 有可用更新。运行 pnpm ui:update 显式更新。'
fi

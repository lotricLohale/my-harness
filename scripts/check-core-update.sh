#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/core"

git -C "$core" fetch origin master --quiet
current="$(git -C "$core" rev-parse HEAD)"
latest="$(git -C "$core" rev-parse origin/master)"

printf 'current=%s\nlatest=%s\n' "$current" "$latest"
if [[ "$current" == "$latest" ]]; then
  echo 'DeepSeek Harness 已是最新版本。'
else
  echo '检测到 DeepSeek Harness 更新；运行 pnpm core:update 更新并重新验证插件。'
fi

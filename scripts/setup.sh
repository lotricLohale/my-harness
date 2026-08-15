#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/core"
plugin="$root/plugins/dsh-antigravity"
desktop="$root/desktop"

# core 是只读 submodule；跳过其仓库级 Git hook 安装脚本。
CI=true pnpm --dir "$core" install --frozen-lockfile --ignore-scripts
node "$core/packages/subprocess/subprocess-local/scripts/ensure-spawn-helper.mjs"
(
  cd "$core"
  ./node_modules/.bin/tsc -b tsconfig.host.json
  ./node_modules/.bin/tsdown --env.DSH_BUILD_FACE host
  ./node_modules/.bin/tsc -b tsconfig.client.json
  ./node_modules/.bin/tsdown --env.DSH_BUILD_FACE client
  (cd apps/web && ./node_modules/.bin/vite build)
)
CI=true pnpm --dir "$plugin" install --frozen-lockfile
pnpm --dir "$plugin" build
CI=true pnpm --dir "$desktop" install --frozen-lockfile

archive="$(cd "$plugin" && pnpm pack --pack-destination "$plugin" | tail -n 1)"
archive_path="$plugin/$archive"
(
  cd "$core"
  node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add "$archive_path"
)
rm -f "$archive_path"

echo '初始化完成。运行 pnpm dev 启动 Tauri。'

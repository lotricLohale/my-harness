#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/core"
oauth="$root/plugins/dsh-oauth"
ponytail="$root/plugins/dsh-ponytail"
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
CI=true pnpm --dir "$oauth" install --frozen-lockfile
pnpm --dir "$oauth" build
CI=true pnpm --dir "$ponytail" install --frozen-lockfile
pnpm --dir "$ponytail" build
CI=true pnpm --dir "$desktop" install --frozen-lockfile

bash "$root/scripts/dsh-plugin.sh" --profile web add "link:$oauth"
bash "$root/scripts/dsh-plugin.sh" --profile web add "link:$ponytail"
bash "$root/scripts/dsh-plugin.sh" --profile web add dshmarket
bash "$root/scripts/setup-ui.sh"

echo '初始化完成。运行 pnpm dev 启动 Tauri。'

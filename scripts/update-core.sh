#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/core"

if [[ -n "$(git -C "$core" status --porcelain)" ]]; then
	echo 'core/ 存在未提交修改，拒绝更新。' >&2
	exit 1
fi

git -C "$core" fetch origin master --quiet
git -C "$core" checkout --detach origin/master
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
pnpm --dir "$root/plugins/dsh-oauth" build
pnpm --dir "$root/plugins/dsh-oauth" test
pnpm --dir "$root/plugins/dsh-ponytail" build
pnpm --dir "$root/plugins/dsh-ponytail" test

echo 'DeepSeek Harness 已更新；父仓库中的 core 子模块指针由你决定何时提交。'

#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/core"

if ! git -C "$core" diff --quiet || ! git -C "$core" diff --cached --quiet; then
	echo 'core/ 存在未提交修改，拒绝更新。' >&2
	exit 1
fi

git -C "$core" fetch origin master --quiet
git -C "$core" checkout -f --detach origin/master
git -C "$core" clean -dfq packages/ 2>/dev/null || true
CI=true pnpm --dir "$core" install --frozen-lockfile --ignore-scripts
node "$core/packages/subprocess/subprocess-local/scripts/ensure-spawn-helper.mjs"
(
	cd "$core"
	export CI=true
	export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"
	pnpm run clean
	pnpm run build
)
CI=true pnpm --dir "$root/plugins/dsh-oauth" install --frozen-lockfile
pnpm --dir "$root/plugins/dsh-oauth" build
pnpm --dir "$root/plugins/dsh-oauth" test
if [[ -d "$root/plugins/dsh-antigravity" ]]; then
	CI=true pnpm --dir "$root/plugins/dsh-antigravity" install --frozen-lockfile
	pnpm --dir "$root/plugins/dsh-antigravity" build
	pnpm --dir "$root/plugins/dsh-antigravity" test
fi
CI=true pnpm --dir "$root/plugins/dsh-ponytail" install --frozen-lockfile
pnpm --dir "$root/plugins/dsh-ponytail" build
pnpm --dir "$root/plugins/dsh-ponytail" test

echo 'DeepSeek Harness 已更新；父仓库中的 core 子模块指针由你决定何时提交。'

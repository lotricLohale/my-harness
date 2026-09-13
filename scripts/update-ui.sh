#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ui="$root/web-ui"

if ! git -C "$ui" diff --quiet || ! git -C "$ui" diff --cached --quiet; then
  echo 'web-ui/ 存在未提交修改，拒绝更新。' >&2
  exit 1
fi

git -C "$ui" fetch origin main --quiet
git -C "$ui" checkout -f --detach origin/main
git -C "$ui" clean -dfq packages/ 2>/dev/null || true
bash "$root/scripts/setup-ui.sh"

echo 'dsh-web-ui 已更新；父仓库中的 web-ui 子模块指针由你决定何时提交。'

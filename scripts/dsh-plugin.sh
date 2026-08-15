#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
shim="$(mktemp -d)"
trap 'rm -rf "$shim"' EXIT
cat > "$shim/pnpm" <<'SH'
#!/usr/bin/env bash
exec corepack pnpm@11.7.0 "$@"
SH
chmod +x "$shim/pnpm"
(
  cd "$root/core"
  PATH="$shim:$PATH" node --import tsx/esm apps/cli/src/bin.ts plugin "$@"
)

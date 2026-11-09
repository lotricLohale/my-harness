MDSH core bump to DSH 0.2.2-rc.1 (npm latest) and matching plugin peer/API updates.
Do not follow origin/master via `pnpm core:update`. Discard local dirty patches inside `core/`.
Keep existing uncommitted dsh-oauth WIP (auto-retry, order, pi-antigravity 0.12).

## Specs

S1. "升到最新的核心"
S2. "升级对应的插件一起改了"

## Tasks

- T1 S1 checkout `core` to `dsh-v0.2.2-rc.1`, install with `CI=true`, build — cdfc124
- T2 S2 port `plugins/dsh-oauth` peers/devDeps/`engines.dsh` and compile against 0.2.2 — pending commit with T3-T4
- T3 S2 port `plugins/dsh-ponytail` the same way — pending commit with T2-T4
- T4 S1-S2 `pnpm plugin:build` + `plugin:test`, reinstall web profile links — pending commit with T2-T3

## Log

L1. 升到最新的核心
L2. 升级对应的插件一起改了
L3. Latest published core is npm `latest`/`next` `0.2.2-rc.1` (git tag `dsh-v0.2.2-rc.1`). No non-alpha/rc official tag exists; operator overrode the pin-to-stable rule for this bump.
L4. Out of scope unless boot fails: `web-ui` (still v0.3.21 / 6bddd21a), leftover `plugins/dsh-antigravity|dsh-xai|dsh-claude-code`, `desktop/` tray WIP.

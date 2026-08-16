# MDSH

Tauri v2 桌面外壳，原样运行 DeepSeek Harness，并通过仓库外的 Cordis bundle 接入 OAuth 模型。

## 目录

- `core/`：`deepseek-ai/deepseek-harness` Git submodule，不在本仓库修改
- `plugins/dsh-oauth/`：可单独发布的模块化 OAuth 插件；Antigravity 与 xAI 是其中两个授权模块
- `plugins/dsh-ponytail/`：Ponytail 少写代码模式；`/ponytail` 切档，每轮注入规则
- `web-ui/`：`zhu1090093659/dsh-web-ui` Git submodule，可独立检查和更新
- `desktop/`：启动并托管 DSH Web 的 Tauri 应用

## 初始化

需要 Node.js 22.19+/24、pnpm 11、Rust 和 Tauri 系统依赖。

```bash
git clone --recurse-submodules https://github.com/lotricLohale/my-harness.git
cd my-harness
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` 会安装并构建 core、`dsh-oauth` 插件以及 `dsh-web-ui` 全家桶，再通过 DSH CLI 安装到 Web profile。首次初始化默认启用“鲸吟（Whale Song）”皮肤和暗色“深海夜航调”；之后保留用户自行选择的皮肤与明暗设置。它不修改 `core/` 或 `web-ui/` 的 tracked 文件。

## 模型（OAuth）

设置页统一入口是「模型（OAuth）」，用模型选项切换 Antigravity / xAI 账号池。没有授权账号时，对应模型分组不会出现在模型列表里。

```text
/antigravity-login
/xai-login
```

登录后可用 `/antigravity-accounts`、`/xai-accounts` 查看账号，或用 `/antigravity-logout`、`/xai-logout` 删除授权。Token 按模块分开保存在 Host credentials。

## 更新核心

只检查：

```bash
pnpm core:check
```

显式更新 submodule、重装依赖并验证插件：

```bash
pnpm core:update
```

更新不会自动提交新的 submodule 指针。

## 更新 UI 库

只检查：

```bash
pnpm ui:check
```

显式更新、重新构建并安装：

```bash
pnpm ui:update
```

状态栏“检查更新”会同时查看 `core/` 和 `web-ui/`；检查不会自动改变子模块指针。Web profile 默认安装 [dshmarket](https://dshmarket.com/)。

## 当前边界

- 桌面应用目前是源码型本地外壳，运行时依赖 Node、pnpm 和 `core/` checkout；尚未把 Node/DSH 打成离线 sidecar。
- Antigravity 与 xAI 使用 OAuth 协议和云端代理，可能随上游变动。
- 当前插件支持文本、推理和工具调用，暂不支持 Harness image attachment。

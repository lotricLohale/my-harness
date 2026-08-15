# My Harness

Tauri v2 桌面外壳，原样运行 DeepSeek Harness，并通过仓库外的 Cordis bundle 接入 `pi-antigravity`。

## 目录

- `core/`：`deepseek-ai/deepseek-harness` Git submodule，不在本仓库修改
- `plugins/dsh-antigravity/`：Antigravity LLM 外部插件
- `desktop/`：启动并托管 DSH Web 的 Tauri 应用

## 初始化

需要 Node.js 22.19+/24、pnpm 11、Rust 和 Tauri 系统依赖。

```bash
git clone --recurse-submodules https://github.com/lotricLohale/my-harness.git
cd my-harness
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` 会安装并构建 core 的 host/client 产物和 Web 前端，打包插件，再通过 DSH CLI 安装到 Web profile。它不修改 `core/` 的 tracked 文件。

## Antigravity

打开 Harness 后执行：

```text
/antigravity-login
```

命令会返回 Google OAuth URL。浏览器授权完成后运行：

```text
/antigravity-doctor
```

然后在模型选择器选择 `antigravity` provider。OAuth token 存在 Harness credentials 服务的 `ANTIGRAVITY_OAUTH` 引用中。

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

## 当前边界

- 桌面应用目前是源码型本地外壳，运行时依赖 Node、pnpm 和 `core/` checkout；尚未把 Node/DSH 打成离线 sidecar。
- Antigravity 使用非公开 Cloud Code Assist API，可能随上游变化。
- 当前插件支持文本、推理和工具调用，暂不支持 Harness image attachment。

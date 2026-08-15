# MDSH

Tauri v2 桌面外壳，原样运行 DeepSeek Harness，并通过仓库外的 Cordis bundle 接入 `pi-antigravity`。

## 目录

- `core/`：`deepseek-ai/deepseek-harness` Git submodule，不在本仓库修改
- `plugins/dsh-antigravity/`：Antigravity LLM 外部插件
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

`pnpm bootstrap` 会安装并构建 core、Antigravity 插件和 `dsh-web-ui` 全家桶，再通过 DSH CLI 安装到 Web profile。首次初始化默认启用“鲸吟（Whale Song）”皮肤和暗色“深海夜航调”；之后保留用户自行选择的皮肤与明暗设置。它不修改 `core/` 或 `web-ui/` 的 tracked 文件。

## Antigravity

打开 Harness 后执行：

```text
/antigravity-login
```

命令会返回 Google OAuth URL。浏览器授权完成后运行：

```text
/antigravity-doctor
```

然后在“设置 → 模型”确认 Antigravity 行显示已授权邮箱，并在模型选择器选择 `antigravity` provider。“设置 → Antigravity”提供“添加账号”和“刷新用量”，逐账号显示五小时及每周剩余额度；也可使用 `/antigravity-accounts` 查看脱敏账号池。OAuth token 分别保存在 Harness credentials 服务中，settings 只保存邮箱和 credential reference 等非秘密元数据。请求在首个可见输出前遇到明确额度错误时会自动切换到下一个可用账号。

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

状态栏菜单也提供“检查 UI 库更新”；检查不会自动改变 `web-ui/` 子模块指针。

## 当前边界

- 桌面应用目前是源码型本地外壳，运行时依赖 Node、pnpm 和 `core/` checkout；尚未把 Node/DSH 打成离线 sidecar。
- Antigravity 使用非公开 Cloud Code Assist API，可能随上游变化。
- 当前插件支持文本、推理和工具调用，暂不支持 Harness image attachment。

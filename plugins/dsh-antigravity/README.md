# dsh-antigravity

`pi-antigravity` 到 DeepSeek Harness `LlmAdapter` 的外部 Cordis 插件，不修改 `core/`。

## 功能

- provider：`antigravity`
- 复用 `pi-antigravity` 的模型目录、OAuth 和原生流
- `/antigravity-login`：启动 Google OAuth PKCE 登录
- `/antigravity-doctor`：显示脱敏状态
- OAuth 凭据通过 `ctx.credentials` 保存到 `ANTIGRAVITY_OAUTH`

## 限制

- 当前版本支持文本、推理和工具调用，暂不解析 Harness image attachment。
- Antigravity 使用非公开 Cloud Code Assist 接口，可能随上游变化。
- 这是非官方集成，与 Google 无隶属或背书关系。仅使用获授权的账号和服务。

## 上游

协议、OAuth 和模型目录来自 MIT 许可的 [pi-antigravity](https://github.com/Rahularya01/pi-antigravity)，运行时固定依赖 `pi-antigravity@0.2.9`。

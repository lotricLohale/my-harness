# dsh-antigravity

`pi-antigravity` 到 DeepSeek Harness `LlmAdapter` 的外部 Cordis 插件，不修改 `core/`。

## 功能

- provider：`antigravity`
- 出现在 DSH 设置 → 模型，并注册 `llm-antigravity` settings namespace
- 额外注册独立设置页“Antigravity”，紧邻模型页，显示账号和额度
- 复用 `pi-antigravity` 的模型目录、OAuth、原生流和账号用量查询
- `/antigravity-login`：启动 Google OAuth PKCE 登录并打开系统浏览器；同一 email 重复登录会更新同一个账号
- `/antigravity-accounts` 和 `/antigravity-doctor`：显示脱敏账号状态
- `/antigravity-logout [id]`：删除指定授权账号；不传参数时删除当前账号
- Web Host 同源接口：`GET /api/antigravity/accounts`、`DELETE /api/antigravity/accounts/:id`、`POST /api/antigravity/login`
- 每个账号的 OAuth JSON 保存在独立 `credentialRef`；settings 只保存 `id/email/credentialRef/enabled/priority/exhaustedUntil` 元数据
- 兼容旧的 `ANTIGRAVITY_OAUTH`，启动后会纳入账号池
- 请求按启用、未冷却、高优先级账号选择；首个可见 chunk 前遇到明确 quota/rate-limit 才会短冷却并切换账号

## 配置

```yaml
- id: llm-antigravity
  name: dsh-antigravity
  config:
    credentialRef: ANTIGRAVITY_OAUTH
    accounts: []
```

`accounts` 不能包含 `access` 或 `refresh`。需要调整顺序时只改 `priority`，数值越高越优先。

## 设置页边界

DSH core 的 Models `ProviderEditor` 当前没有第三方账号管理扩展槽；因此本包不修改 core UI，而是通过自己的 browser client bundle 注册独立 settings.section：导航名 `Antigravity`，排序在 Models 后面。页面提供“添加账号”、“刷新用量”和“删除账号”；启停仍通过 settings 元数据手动改。

## 限制

- 当前版本支持文本、推理和工具调用，暂不解析 Harness image attachment。
- 浏览器接口和 settings 永不返回 token；单账号 quota 查询失败只显示该账号错误。
- 账号用量复用 `pi-antigravity@0.2.9` 的 `src/usage/usage.js` 子路径；上游未提供稳定 export，所以集中在 `src/upstream.ts`，升级上游时需复查。
- Antigravity 使用非公开 Cloud Code Assist 接口，可能随上游变化。
- 这是非官方集成，与 Google 无隶属或背书关系。仅使用获授权的账号和服务。

## 上游

协议、OAuth、模型目录和 quota 查询来自 MIT 许可的 [pi-antigravity](https://github.com/Rahularya01/pi-antigravity)，运行时固定依赖 `pi-antigravity@0.2.9`。本包带 pnpm patch，把上游 OAuth 成功页和登录说明中的 Pi 改为 DSH。

# dsh-xai

xAI (Grok) OAuth 到 DeepSeek Harness `LlmAdapter` 的外部 Cordis 插件，参考 [pi-xai-oauth](https://github.com/BlockedPath/pi-xai-oauth)，不修改 `core/`。

## 功能

- provider：`xai`
- 出现在 DSH 设置 → 模型，并注册 `llm-xai` settings namespace
- 额外注册独立设置页“xAI (Grok)”，紧邻模型页，显示多账号状态和额度使用情况
- 支持多模型：`grok-4.6`、`grok-4.5`、`grok-4.3`、`grok-composer-2.5-fast`、`grok-4.20-*`、`grok-build`
- 支持 xAI 原生 Responses 协议、Prompt Caching 与推理强度调节（low/medium/high/xhigh）
- `/xai-login`：启动 xAI (Grok) OAuth PKCE 授权登录并自动打开系统浏览器；相同账号重复登录会自动更新凭据
- `/xai-accounts` 和 `/xai-doctor`：显示已脱敏的账号池状态
- `/xai-logout [id]`：删除指定授权账号；不传参数时删除当前账号
- `/xai-usage`：命令行查询活跃账号的月度包含额度、按需计费及预付余额
- Web Host 同源接口：`GET /api/xai/accounts`、`DELETE /api/xai/accounts/:id`、`POST /api/xai/login`
- **多账号与自动切换**：
  - 每个账号的真实 OAuth token 保存在 Host credentials（每个账号分配独立 `credentialRef`）
  - settings 仅持久化非秘密元数据：`id/email/username/credentialRef/enabled/priority/exhaustedUntil`
  - 兼容旧的 `XAI_OAUTH` 单凭据，启动后自动纳入账号池
  - 请求按启用、未冷却、高优先级账号选择候选
  - 首个可见 chunk 前遇到明确限额或速率限制（HTTP 429、quota reached、rate limited 等），会自动将该账号置入短冷却（60s）并无缝故障转移切换至下一个可用账号
  - 账号池全部限额耗尽时抛出明确统一错误

## 配置

```yaml
- id: llm-xai
  name: dsh-xai
  config:
    credentialRef: XAI_OAUTH
    accounts: []
```

`accounts` 不能包含 `access` 或 `refresh`。需要调整顺序时调整 `priority`，数值越大优先级越高。

## 设置页

通过本插件自带的 browser client bundle 注册独立 `settings.section`（ID: `xai`，排序在 Antigravity 后面）。提供“添加账号”、“刷新用量”和“删除账号”，显示订阅等级（SuperGrok 等）、月度额度百分比与美元金额、重置时间等。

## 参考

OAuth 流程、参数、请求头以及用量查询设计参考 MIT 许可的 [pi-xai-oauth](https://github.com/BlockedPath/pi-xai-oauth)。

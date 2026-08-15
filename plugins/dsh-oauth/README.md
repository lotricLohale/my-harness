# dsh-oauth

DeepSeek Harness 的模块化 OAuth 插件。现有两个授权账号作为内部模块：

- `modules/antigravity`：Google Antigravity
- `modules/xai`：xAI (Grok)

后续新增授权账号时，按同样方式加一个 `modules/<name>`，再在 `src/modules.ts` 注册即可。设置页统一入口是「模型（OAuth）」，用模型选项切换账号池。

## 配置

```yaml
- id: llm-oauth
  name: dsh-oauth
  config:
    modules:
      - antigravity
      - xai
    antigravity:
      credentialRef: ANTIGRAVITY_OAUTH
      accounts: []
    xai:
      credentialRef: XAI_OAUTH
      accounts: []
```

`modules` 用来开关内部授权模块。账号 token 仍按模块分开保存在 Host credentials。没有授权账号时，对应模型分组不会出现在模型列表里。

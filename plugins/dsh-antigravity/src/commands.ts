import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type { AntigravityAuth } from './auth.js'

/** 注册不经过模型回合的 Antigravity 管理命令。 */
export function registerCommands(ctx: Context, auth: AntigravityAuth): void {
  ctx.commands.register({
    name: 'antigravity-login',
    description: '启动 Google Antigravity OAuth 登录',
    recordInput: false,
    handler: async () => {
      try {
        const attempt = await auth.beginLogin()
        void attempt.completion.catch(() => undefined)
        return {
          kind: 'success',
          text: `${attempt.instructions ?? '在浏览器中完成 Google 登录。'}\n\n${attempt.url}\n\n完成后运行 /antigravity-doctor 检查凭据。`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  ctx.commands.register({
    name: 'antigravity-doctor',
    description: '显示已脱敏的 Antigravity 凭据和 provider 状态',
    recordInput: false,
    handler: async () => ({
      kind: 'success',
      text: `provider=antigravity\n${await auth.status()}\nupstream=pi-antigravity`,
    }),
  })
}

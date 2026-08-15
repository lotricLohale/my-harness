import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AntigravitySection } from './AntigravitySection.js'

export const inject = ['slots']

/** 注册独立 Antigravity 设置页，紧邻模型页之后。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'antigravity',
    order: 11,
    label: 'Antigravity',
  }, AntigravitySection))
}

export { AntigravitySection } from './AntigravitySection.js'

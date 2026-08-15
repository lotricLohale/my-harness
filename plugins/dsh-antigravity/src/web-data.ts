export interface AntigravityQuotaBucketPayload {
  displayName: string
  remainingFraction: number
  resetTime?: string
}

export interface AntigravityQuotaGroupPayload {
  displayName: string
  buckets: AntigravityQuotaBucketPayload[]
}

export interface AntigravityAccountPayload {
  id: string
  email?: string
  enabled: boolean
  priority: number
  configured: boolean
  expires?: string
  exhaustedUntil?: string
  quota?: AntigravityQuotaGroupPayload[]
  quotaError?: string
}

export interface AntigravityAccountsResponse {
  accounts: AntigravityAccountPayload[]
  loginPending: boolean
}

interface QuotaBucketLike {
  displayName?: unknown
  remainingFraction?: unknown
  resetTime?: unknown
}

interface QuotaGroupLike {
  displayName?: unknown
  buckets?: readonly QuotaBucketLike[]
}

/** 只保留浏览器需要的 quota 字段，禁止把上游对象整包透传。 */
export function serializeQuotaGroups(groups: readonly QuotaGroupLike[] | undefined): AntigravityQuotaGroupPayload[] {
  return (groups ?? []).map(group => ({
    displayName: typeof group.displayName === 'string' ? group.displayName : 'Quota',
    buckets: (group.buckets ?? []).flatMap(bucket => {
      if (typeof bucket.displayName !== 'string' || typeof bucket.remainingFraction !== 'number') return []
      return [{
        displayName: bucket.displayName,
        remainingFraction: Math.max(0, Math.min(1, bucket.remainingFraction)),
        ...(typeof bucket.resetTime === 'string' ? { resetTime: bucket.resetTime } : {}),
      }]
    }),
  })).filter(group => group.buckets.length > 0)
}

/** 百分比文案；组件和测试共享，避免 UI 内散落小算法。 */
export function formatPercent(value: number | undefined): string {
  return value === undefined ? '未知' : `${Math.round(value * 1000) / 10}%`
}

/** 登录按钮状态机：发起后等待授权，成功或失败后停止轮询。 */
export function shouldPollAfterLogin(state: 'idle' | 'starting' | 'waiting' | 'done' | 'error'): boolean {
  return state === 'waiting'
}

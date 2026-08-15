export interface UpstreamQuotaBucket {
  displayName: string
  remainingFraction: number
  resetTime?: string
}

export interface UpstreamQuotaGroup {
  displayName: string
  buckets: UpstreamQuotaBucket[]
}

export function fetchAccountUsage(apiKeyRaw?: string): Promise<{ groups: UpstreamQuotaGroup[] }>

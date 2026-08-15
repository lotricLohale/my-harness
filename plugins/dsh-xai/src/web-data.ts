import type { XaiUsageSnapshot } from "./usage.js";

export interface XaiQuotaBucketPayload {
	displayName: string;
	remainingFraction?: number;
	detail?: string;
	resetTime?: string;
}

export interface XaiQuotaGroupPayload {
	displayName: string;
	buckets: XaiQuotaBucketPayload[];
}

export interface XaiAccountPayload {
	id: string;
	email?: string;
	username?: string;
	enabled: boolean;
	priority: number;
	configured: boolean;
	expires?: string;
	exhaustedUntil?: string;
	quota?: XaiQuotaGroupPayload[];
	quotaError?: string;
}

export interface XaiAccountsResponse {
	accounts: XaiAccountPayload[];
	loginPending: boolean;
}

export function formatCents(cents: number | undefined): string {
	if (cents === undefined) return "未知";
	return `$${(cents / 100).toFixed(2)}`;
}

export function formatPercent(fraction: number | undefined): string {
	if (fraction === undefined) return "未知";
	return `${Math.round(fraction * 1000) / 10}%`;
}

export function serializeQuotaGroups(
	usage: XaiUsageSnapshot | undefined,
): XaiQuotaGroupPayload[] {
	if (!usage) return [];
	const groups: XaiQuotaGroupPayload[] = [];

	const includedBuckets: XaiQuotaBucketPayload[] = [];
	if (usage.subscriptionTier !== undefined) {
		includedBuckets.push({
			displayName: "订阅等级",
			detail: usage.subscriptionTier,
		});
	}
	if (usage.creditUsagePercent !== undefined) {
		const remaining = Math.max(
			0,
			Math.min(1, 1 - usage.creditUsagePercent / 100),
		);
		includedBuckets.push({
			displayName: "额度剩余",
			remainingFraction: remaining,
			detail: `${formatPercent(remaining)} 剩余 (已用 ${usage.creditUsagePercent.toFixed(1)}%)`,
			resetTime: usage.currentPeriod?.end,
		});
	}
	if (usage.usedCents !== undefined || usage.monthlyLimitCents !== undefined) {
		includedBuckets.push({
			displayName: "月度额度",
			detail: `已用 ${formatCents(usage.usedCents)} / 总计 ${formatCents(usage.monthlyLimitCents)}`,
			resetTime: usage.currentPeriod?.end,
		});
	}
	if (includedBuckets.length > 0) {
		groups.push({ displayName: "包含额度", buckets: includedBuckets });
	}

	const onDemandBuckets: XaiQuotaBucketPayload[] = [];
	if (usage.onDemandEnabled !== undefined) {
		onDemandBuckets.push({
			displayName: "按需计费",
			detail: usage.onDemandEnabled ? "已开启" : "未开启",
		});
	}
	if (
		usage.onDemandUsedCents !== undefined ||
		usage.onDemandCapCents !== undefined
	) {
		onDemandBuckets.push({
			displayName: "按需用量",
			detail: `已用 ${formatCents(usage.onDemandUsedCents)} / 上限 ${formatCents(usage.onDemandCapCents)}`,
		});
	}
	if (usage.prepaidBalanceCents !== undefined) {
		onDemandBuckets.push({
			displayName: "预付余额",
			detail: formatCents(usage.prepaidBalanceCents),
		});
	}
	if (onDemandBuckets.length > 0) {
		groups.push({ displayName: "按需与余额", buckets: onDemandBuckets });
	}

	return groups;
}

export function shouldPollAfterLogin(
	state: "idle" | "starting" | "waiting" | "done" | "error",
): boolean {
	return state === "waiting";
}

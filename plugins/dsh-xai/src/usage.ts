export interface XaiUsagePeriod {
	start?: string;
	end?: string;
}

export interface XaiUsageSnapshot {
	subscriptionTier?: string;
	creditUsagePercent?: number;
	monthlyLimitCents?: number;
	usedCents?: number;
	onDemandCapCents?: number;
	onDemandUsedCents?: number;
	prepaidBalanceCents?: number;
	onDemandEnabled?: boolean;
	currentPeriod?: XaiUsagePeriod;
}

const XAI_CLI_USER_URL = "https://cli-chat-proxy.grok.com/v1/user";
const XAI_CLI_BILLING_URL =
	"https://cli-chat-proxy.grok.com/v1/billing?format=credits";

function centsOf(value: unknown): number | undefined {
	if (typeof value === "object" && value !== null && "val" in value) {
		const val = (value as { val: unknown }).val;
		if (typeof val === "number" && Number.isFinite(val) && val >= 0) return val;
	}
	return undefined;
}

interface BillingConfigPayload {
	creditUsagePercent?: number;
	monthlyLimit?: { val?: number };
	used?: { val?: number };
	onDemandCap?: { val?: number };
	onDemandUsed?: { val?: number };
	prepaidBalance?: { val?: number };
	currentPeriod?: { start?: string; end?: string };
}

interface BillingResponsePayload {
	subscriptionTier?: string;
	onDemandEnabled?: boolean;
	config?: BillingConfigPayload;
}

export async function fetchAccountUsage(
	apiKey: string,
): Promise<XaiUsageSnapshot> {
	const baseHeaders: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		"User-Agent": "dsh-xai/0.1.0",
		"X-XAI-Token-Auth": "xai-grok-cli",
		"x-grok-client-version": "1.5.0",
		"x-grok-client-mode": "interactive",
	};

	// 1. 获取 userId
	const userRes = await fetch(XAI_CLI_USER_URL, {
		method: "GET",
		headers: baseHeaders,
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	if (!userRes.ok) {
		throw new Error(
			`xAI user identity request failed (HTTP ${userRes.status})`,
		);
	}
	const userData = (await userRes.json()) as { userId?: string };
	const userId =
		typeof userData?.userId === "string" ? userData.userId : undefined;

	// 2. 获取 billing
	const billingHeaders: Record<string, string> = {
		...baseHeaders,
		...(userId ? { "x-userid": userId } : {}),
	};
	const billingRes = await fetch(XAI_CLI_BILLING_URL, {
		method: "GET",
		headers: billingHeaders,
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	if (!billingRes.ok) {
		throw new Error(`xAI billing request failed (HTTP ${billingRes.status})`);
	}

	const billingData = (await billingRes.json()) as BillingResponsePayload;
	const config = billingData.config ?? {};

	const currentPeriod: XaiUsagePeriod = {};
	if (config.currentPeriod && typeof config.currentPeriod === "object") {
		if (typeof config.currentPeriod.start === "string")
			currentPeriod.start = config.currentPeriod.start;
		if (typeof config.currentPeriod.end === "string")
			currentPeriod.end = config.currentPeriod.end;
	}

	return {
		subscriptionTier:
			typeof billingData.subscriptionTier === "string"
				? billingData.subscriptionTier
				: undefined,
		onDemandEnabled:
			typeof billingData.onDemandEnabled === "boolean"
				? billingData.onDemandEnabled
				: undefined,
		creditUsagePercent:
			typeof config.creditUsagePercent === "number"
				? config.creditUsagePercent
				: undefined,
		monthlyLimitCents: centsOf(config.monthlyLimit),
		usedCents: centsOf(config.used),
		onDemandCapCents: centsOf(config.onDemandCap),
		onDemandUsedCents: centsOf(config.onDemandUsed),
		prepaidBalanceCents: centsOf(config.prepaidBalance),
		currentPeriod:
			Object.keys(currentPeriod).length > 0 ? currentPeriod : undefined,
	};
}

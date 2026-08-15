import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-commands";
import type { XaiAuth } from "./auth.js";
import { openBrowser } from "./server.js";
import { fetchAccountUsage } from "./usage.js";
import { formatCents, formatPercent } from "./web-data.js";

/** 注册不经过模型回合的 xAI 管理命令。 */
export function registerCommands(ctx: Context, auth: XaiAuth): void {
	ctx.commands.register({
		name: "xai-login",
		description: "启动 xAI (Grok) OAuth 登录",
		recordInput: false,
		handler: async () => {
			try {
				const attempt = await auth.beginLogin();
				void attempt.completion.catch(() => undefined);
				let browserWarning = "";
				try {
					await openBrowser(attempt.url);
				} catch (error) {
					browserWarning = `\n\n系统浏览器打开失败，请手动复制上面的地址：${error instanceof Error ? error.message : String(error)}`;
				}
				return {
					kind: "success",
					text: `${attempt.instructions ?? "在浏览器中完成 xAI 授权。"}\n\n${attempt.url}${browserWarning}\n\n完成后运行 /xai-accounts 检查账号池。`,
				};
			} catch (error) {
				return {
					kind: "error",
					text: error instanceof Error ? error.message : String(error),
				};
			}
		},
	});

	const status = async () => ({
		kind: "success" as const,
		text: `provider=xai\n${await auth.status()}\nmodels=grok-4.6,grok-4.5,grok-4.3,...`,
	});

	ctx.commands.register({
		name: "xai-accounts",
		description: "显示已脱敏的 xAI 多账号状态",
		recordInput: false,
		handler: status,
	});

	ctx.commands.register({
		name: "xai-logout",
		description: "删除指定 xAI 授权账号；不传参数时删除当前账号",
		recordInput: false,
		handler: async (invocation) => {
			const id = invocation.rawInput.trim();
			const target = id.length > 0 ? id : (await auth.candidates())[0]?.id;
			if (target === undefined) {
				return { kind: "error", text: "xAI 没有可删除的账号。" };
			}
			try {
				const removed = await auth.removeAccount(target);
				return {
					kind: "success",
					text: `已删除 xAI 账号 ${removed.email ?? removed.username ?? removed.id}。`,
				};
			} catch (error) {
				return {
					kind: "error",
					text: error instanceof Error ? error.message : String(error),
				};
			}
		},
	});

	ctx.commands.register({
		name: "xai-doctor",
		description: "显示已脱敏的 xAI 凭据和 provider 状态",
		recordInput: false,
		handler: status,
	});

	ctx.commands.register({
		name: "xai-usage",
		description: "查询当前活跃 xAI 账号的用量与订阅详情",
		recordInput: false,
		handler: async () => {
			const candidates = await auth.candidates();
			if (candidates.length === 0) {
				return {
					kind: "error",
					text: "xAI 没有已启用的账号；请先运行 /xai-login。",
				};
			}
			const account = candidates[0]!;
			try {
				const apiKey = await auth.apiKeyFor(account);
				const usage = await fetchAccountUsage(apiKey);
				const lines = [
					`xAI 账号用量 (${account.email ?? account.username ?? account.id}):`,
					usage.subscriptionTier
						? `订阅等级: ${usage.subscriptionTier}`
						: undefined,
					usage.creditUsagePercent !== undefined
						? `包含额度使用率: ${formatPercent(usage.creditUsagePercent / 100)}`
						: undefined,
					usage.usedCents !== undefined || usage.monthlyLimitCents !== undefined
						? `月度额度: 已用 ${formatCents(usage.usedCents)} / 总计 ${formatCents(usage.monthlyLimitCents)}`
						: undefined,
					usage.currentPeriod?.end
						? `额度重置时间: ${usage.currentPeriod.end}`
						: undefined,
					usage.onDemandEnabled !== undefined
						? `按需计费: ${usage.onDemandEnabled ? "已开启" : "未开启"}`
						: undefined,
					usage.onDemandUsedCents !== undefined ||
					usage.onDemandCapCents !== undefined
						? `按需用量: 已用 ${formatCents(usage.onDemandUsedCents)} / 上限 ${formatCents(usage.onDemandCapCents)}`
						: undefined,
					usage.prepaidBalanceCents !== undefined
						? `预付余额: ${formatCents(usage.prepaidBalanceCents)}`
						: undefined,
				].filter((line): line is string => line !== undefined);

				return { kind: "success", text: lines.join("\n") };
			} catch (error) {
				return {
					kind: "error",
					text: `查询用量失败: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		},
	});
}

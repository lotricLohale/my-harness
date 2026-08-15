import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-commands";
import type { AntigravityAuth } from "./auth.js";
import { openBrowser } from "./server.js";

/** 注册不经过模型回合的 Antigravity 管理命令。 */
export function registerCommands(ctx: Context, auth: AntigravityAuth): void {
	ctx.commands.register({
		name: "antigravity-login",
		description: "启动 Google Antigravity OAuth 登录",
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
					text: `${attempt.instructions ?? "在浏览器中完成 Google 登录。"}\n\n${attempt.url}${browserWarning}\n\n完成后运行 /antigravity-accounts 检查账号池。`,
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
		text: `provider=antigravity\n${await auth.status()}\nupstream=pi-antigravity`,
	});

	ctx.commands.register({
		name: "antigravity-accounts",
		description: "显示已脱敏的 Antigravity 多账号状态",
		recordInput: false,
		handler: status,
	});

	ctx.commands.register({
		name: "antigravity-logout",
		description: "删除指定 Antigravity 授权账号；不传参数时删除当前账号",
		recordInput: false,
		handler: async (invocation) => {
			const id = invocation.rawInput.trim();
			const target = id.length > 0 ? id : (await auth.candidates())[0]?.id;
			if (target === undefined) {
				return { kind: "error", text: "Antigravity 没有可删除的账号。" };
			}
			try {
				const removed = await auth.removeAccount(target);
				return {
					kind: "success",
					text: `已删除 Antigravity 账号 ${removed.email ?? removed.id}。`,
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
		name: "antigravity-doctor",
		description: "显示已脱敏的 Antigravity 凭据和 provider 状态",
		recordInput: false,
		handler: status,
	});
}

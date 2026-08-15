/**
 * xAI (Grok) OAuth 到 DeepSeek Harness 的 Cordis 适配插件。
 * @module dsh-xai
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-llm";
import { registerModelActivity } from "./activity.js";
import { XaiAdapter } from "./adapter.js";
import { XaiAuth, type XaiAccountMeta } from "./auth.js";
import { registerCommands } from "./commands.js";
import { createXaiOAuth } from "./oauth.js";
import { registerWebRoutes } from "./server.js";

export const name = "llm-xai";
export const inject = ["llm", "credentials", "commands", "settings"];

const NS = "llm-xai" as never;
const PROVIDER = "xai-oauth";

/** 插件配置和 settings namespace 形状；accounts 只保存非秘密元数据。 */
export interface Config {
	/** 兼容旧版完整 OAuth JSON 的 Harness credential reference。 */
	credentialRef?: string;
	/** 多账号池元数据；真实 OAuth token 保存在每个 credentialRef 指向的凭据中。 */
	accounts?: XaiAccountMeta[];
}

const AccountConfig: z<XaiAccountMeta> = z.object({
	id: z.string().required(),
	email: z.string(),
	username: z.string(),
	credentialRef: z.string().required(),
	enabled: z.boolean().default(true),
	priority: z.number().default(0),
	exhaustedUntil: z.number(),
});

/** Loader 运行时配置校验。 */
export const Config: z<Config> = z.object({
	credentialRef: z.string().default("XAI_OAUTH"),
	accounts: z.array(AccountConfig).default([]),
});

/** 注册 xAI adapter、settings namespace 和管理命令。 */
export function apply(ctx: Context, config: Config): void {
	const oauth = createXaiOAuth();
	let resolvedConfig = Config(config);
	const auth = new XaiAuth(ctx, () => resolvedConfig, oauth);
	const directory = ctx.llm.registerConfigurableProviders([
		{
			provider: PROVIDER,
			displayName: auth.displayName(),
			settingsNs: NS,
			settingsPath: [],
		},
	]);
	const refreshDirectory = (): void => {
		directory.replace([
			{
				provider: PROVIDER,
				displayName: auth.displayName(),
				settingsNs: NS,
				settingsPath: [],
			},
		]);
	};
	const scope = (
		ctx as unknown as {
			settings: {
				register: (
					ns: never,
					schema: z<Config>,
					options: { base: Config },
				) => {
					get: () => Config;
					update: (patch: object) => Promise<void>;
					watch: (callback: (next: Config) => void) => () => void;
				};
			};
		}
	).settings.register(NS, Config, { base: config });
	resolvedConfig = scope.get();
	auth.setConfigWriter((patch) => scope.update(patch));
	ctx.effect(() =>
		scope.watch((next) => {
			resolvedConfig = next;
			refreshDirectory();
		}),
	);
	refreshDirectory();
	void auth
		.initialize()
		.then(refreshDirectory)
		.catch((error: unknown) => {
			ctx.logger.warn("xai legacy credential migration failed");
			ctx.logger.warn(error);
		});
	registerModelActivity(ctx);
	ctx.llm.registerAdapter([PROVIDER, "xai-auth"], new XaiAdapter(auth));
	registerCommands(ctx, auth);
	registerWebRoutes(ctx, auth);
}

export { XaiAdapter, isQuotaError } from "./adapter.js";
export { XaiAuth, accountCandidates, parseCredentials } from "./auth.js";
export { assertSameOrigin, assertSameOriginJson, writeJson } from "./server.js";
export {
	formatCents,
	formatPercent,
	serializeQuotaGroups,
	shouldPollAfterLogin,
} from "./web-data.js";
export { mapStopReason, mapUsage, toStreamChunks } from "./stream.js";
export { KNOWN_XAI_MODELS, findXaiModel, DEFAULT_XAI_MODEL } from "./models.js";

/**
 * Modular OAuth provider bundle for DeepSeek Harness.
 * @module dsh-oauth
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-llm";
import { Config as AntigravityConfig } from "../modules/antigravity/src/index.js";
import { Config as XaiConfig } from "../modules/xai/src/index.js";
import { enabledModules, OAUTH_MODULE_IDS } from "./modules.js";
import { registerTodayUsage } from "./usage-today.js";
import {
	loadLegacyOauthAccounts,
	withLegacyOauthAccounts,
} from "./legacy-accounts.js";

export const name = "llm-oauth";
export const inject = ["llm", "credentials", "commands", "settings", "connection"];

export interface Config {
	modules?: string[];
	antigravity?: object;
	xai?: object;
}

export const Config = z.object({
	modules: z.array(z.string()).default([...OAUTH_MODULE_IDS]),
	antigravity: AntigravityConfig.default({}),
	xai: XaiConfig.default({}),
});

export function apply(ctx: Context, config: Config): void {
	let resolved = Config(config);
	const merged = withLegacyOauthAccounts(resolved, loadLegacyOauthAccounts());
	if (merged.migrated) {
		resolved = Config({
			...resolved,
			antigravity: merged.antigravity,
			xai: merged.xai,
		});
	}
	for (const module of enabledModules(resolved.modules)) {
		try {
			module.apply(ctx, module.configOf(resolved));
		} catch (error) {
			ctx.logger.error(error);
		}
	}
	registerTodayUsage(ctx);
}

export { enabledModules, OAUTH_MODULE_IDS, OAUTH_MODULES } from "./modules.js";
export type { OAuthModuleId } from "./modules.js";

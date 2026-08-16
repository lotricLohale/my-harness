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

export const name = "llm-oauth";
export const inject = ["llm", "credentials", "commands", "settings"];

export interface Config {
	modules?: string[];
	antigravity?: object;
	xai?: object;
}

export const Config: z<Config> = z.object({
	modules: z.array(z.string()).default([...OAUTH_MODULE_IDS]),
	antigravity: AntigravityConfig.default({}),
	xai: XaiConfig.default({}),
});

export function apply(ctx: Context, config: Config): void {
	const resolved = Config(config);
	for (const module of enabledModules(resolved.modules)) {
		module.apply(ctx, module.configOf(resolved));
	}
	registerTodayUsage(ctx);
}

export { enabledModules, OAUTH_MODULE_IDS, OAUTH_MODULES } from "./modules.js";
export type { OAuthModuleId } from "./modules.js";

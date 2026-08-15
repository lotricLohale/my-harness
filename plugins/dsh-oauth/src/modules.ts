import type { Context } from "@deepseek-ai/cordis";
import {
	apply as applyAntigravity,
	Config as AntigravityConfig,
} from "../modules/antigravity/src/index.js";
import {
	apply as applyXai,
	Config as XaiConfig,
} from "../modules/xai/src/index.js";
import {
	OAUTH_MODULE_IDS,
	OAUTH_MODULE_OPTIONS,
	type OAuthModuleId,
} from "./client/catalog.js";

export { OAUTH_MODULE_IDS, OAUTH_MODULE_OPTIONS };
export type { OAuthModuleId };

export interface OAuthModuleDefinition {
	id: OAuthModuleId;
	label: string;
	apply: (ctx: Context, config: object) => void;
	configOf: (root: { antigravity?: object; xai?: object }) => object;
}

export const OAUTH_MODULES: readonly OAuthModuleDefinition[] =
	OAUTH_MODULE_OPTIONS.map((option) => {
		if (option.id === "antigravity") {
			return {
				...option,
				apply: (ctx, config) =>
					applyAntigravity(ctx, AntigravityConfig(config)),
				configOf: (root) => root.antigravity ?? {},
			};
		}
		return {
			...option,
			apply: (ctx, config) => applyXai(ctx, XaiConfig(config)),
			configOf: (root) => root.xai ?? {},
		};
	});

export function enabledModules(
	ids: readonly string[] | undefined,
): OAuthModuleDefinition[] {
	const selected =
		ids === undefined || ids.length === 0 ? [...OAUTH_MODULE_IDS] : ids;
	return OAUTH_MODULES.filter((module) => selected.includes(module.id));
}

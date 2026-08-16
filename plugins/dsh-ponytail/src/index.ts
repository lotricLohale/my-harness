/**
 * Ponytail lazy-coding mode for DeepSeek Harness.
 * @module dsh-ponytail
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-commands";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-system-prompt";
import { getPonytailInstructions } from "./instructions.js";
import {
	DEFAULT_MODE,
	type PonytailMode,
	parsePonytailCommand,
	PONYTAIL_MODES,
} from "./mode.js";
import { registerSkills } from "./skills.js";

export const name = "ponytail";
export const inject = ["systemPrompt", "commands", "settings", "skills"];

const NS = settingsNamespace("ponytail");

export interface Config {
	mode?: PonytailMode;
}

export const Config: z<Config> = z.object({
	mode: z
		.union(PONYTAIL_MODES.map((mode) => z.const(mode)))
		.default(DEFAULT_MODE),
});

function statusText(mode: PonytailMode): string {
	return `Ponytail: ${mode}. /ponytail lite|full|ultra|off`;
}

/** 注册每轮规则注入、/ponytail 切档和打包 skill。 */
export function apply(ctx: Context, config: Config): void {
	const scope = ctx.settings.register(NS, Config, { base: config });
	let mode: PonytailMode = parseStoredMode(scope.get().mode);

	ctx.effect(() =>
		scope.watch((next) => {
			mode = parseStoredMode(next.mode);
		}),
	);

	ctx.systemPrompt.section({
		name: "ponytail",
		order: 50,
		text: () => getPonytailInstructions(mode),
	});

	ctx.commands.register({
		name: "ponytail",
		description: "Set Ponytail intensity: lite, full, ultra, or off",
		input: { hint: "lite | full | ultra | off" },
		recordInput: false,
		handler: async (invocation) => {
			const parsed = parsePonytailCommand(invocation.rawInput);
			if (parsed.type === "status") {
				return { kind: "success", text: statusText(mode) };
			}
			if (parsed.type === "invalid") {
				return {
					kind: "error",
					text: `Unknown Ponytail mode "${parsed.input}". Use lite, full, ultra, or off.`,
				};
			}
			await scope.update({ mode: parsed.mode });
			mode = parsed.mode;
			return { kind: "success", text: statusText(mode) };
		},
	});

	registerSkills(ctx);
}

function parseStoredMode(value: PonytailMode | undefined): PonytailMode {
	return value ?? DEFAULT_MODE;
}

export {
	DEFAULT_MODE,
	isDeactivationCommand,
	parseMode,
	parsePonytailCommand,
	PONYTAIL_MODES,
} from "./mode.js";
export {
	filterSkillBodyForMode,
	getPonytailInstructions,
} from "./instructions.js";

export const PONYTAIL_MODES = ["off", "lite", "full", "ultra"] as const;

export type PonytailMode = (typeof PONYTAIL_MODES)[number];

export const DEFAULT_MODE: PonytailMode = "full";

/** 解析 lite/full/ultra/off；其它输入返回 undefined。 */
export function parseMode(value: string | undefined): PonytailMode | undefined {
	if (value === undefined) return undefined;
	const mode = value.trim().toLowerCase();
	return PONYTAIL_MODES.find((item) => item === mode);
}

/** 整句关闭：stop ponytail / normal mode。 */
export function isDeactivationCommand(text: string): boolean {
	const normalized = text
		.trim()
		.toLowerCase()
		.replace(/[.!?\s]+$/u, "");
	return normalized === "stop ponytail" || normalized === "normal mode";
}

export type PonytailCommand =
	| { type: "status" }
	| { type: "set-mode"; mode: PonytailMode }
	| { type: "invalid"; input: string };

/** 解析 /ponytail 参数。空输入是查状态，不是切到 full。 */
export function parsePonytailCommand(rawInput: string): PonytailCommand {
	const input = rawInput.trim().toLowerCase();
	if (input.length === 0 || input === "status") return { type: "status" };
	const mode = parseMode(input);
	if (mode !== undefined) return { type: "set-mode", mode };
	return { type: "invalid", input: rawInput.trim() };
}

import { readFileSync } from "node:fs";
import { DEFAULT_MODE, type PonytailMode, parseMode } from "./mode.js";
import { skillPath } from "./paths.js";

/** 只保留当前档位的强度表和示例，其余规则原样留下。 */
export function filterSkillBodyForMode(
	body: string,
	mode: PonytailMode,
): string {
	return body
		.replace(/^---[\s\S]*?---\s*/u, "")
		.split(/\r?\n/u)
		.filter((line) => {
			const table = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/u);
			if (table?.[1] !== undefined) {
				const label = parseMode(table[1]);
				if (label !== undefined) return label === mode;
			}
			const example = line.match(/^-\s*([^:]+):\s*"/u);
			if (example?.[1] !== undefined) {
				const label = parseMode(example[1]);
				if (label !== undefined) return label === mode;
			}
			return true;
		})
		.join("\n");
}

export function getPonytailInstructions(mode: PonytailMode): string {
	if (mode === "off") return "";
	try {
		return `PONYTAIL MODE ACTIVE — level: ${mode}\n\n${filterSkillBodyForMode(readFileSync(skillPath("ponytail.md"), "utf8"), mode)}`;
	} catch {
		return `PONYTAIL MODE ACTIVE — level: ${mode || DEFAULT_MODE}`;
	}
}

import { readFile } from "node:fs/promises";
import type { Context } from "@deepseek-ai/cordis";
import {
	BUNDLED_SKILL_RANK,
	type SkillCandidate,
	type SkillDefinition,
	type SkillProvider,
} from "@deepseek-ai/dsh-skill";
import { packageRoot, skillPath } from "./paths.js";

const PROVIDER = "dsh-ponytail";
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;

interface BundledSkill {
	name: string;
	file: string;
	description: string;
}

const BUNDLED: readonly BundledSkill[] = [
	{
		name: "ponytail-review",
		file: "ponytail-review.md",
		description:
			"Review the current diff for over-engineering. One line per finding: location, what to cut, what replaces it.",
	},
	{
		name: "ponytail-audit",
		file: "ponytail-audit.md",
		description:
			"Audit the whole repo for over-engineering. Ranked list of what to delete, simplify, or replace.",
	},
	{
		name: "ponytail-debt",
		file: "ponytail-debt.md",
		description:
			"Harvest ponytail: shortcut comments into a debt ledger. One-shot report, changes nothing.",
	},
	{
		name: "ponytail-gain",
		file: "ponytail-gain.md",
		description:
			"Show ponytail's measured impact scoreboard. One-shot display, not a per-repo number.",
	},
	{
		name: "ponytail-help",
		file: "ponytail-help.md",
		description:
			"Quick-reference card for ponytail modes, skills, and commands.",
	},
];

function candidateOf(skill: BundledSkill): SkillCandidate {
	return {
		name: skill.name,
		description: skill.description,
		invocation: INVOCATION,
		provider: PROVIDER,
		source: "bundled",
		resourceBase: { kind: "directory", path: packageRoot() },
		rank: BUNDLED_SKILL_RANK,
		locator: skill.file,
	};
}

const CANDIDATES = BUNDLED.map(candidateOf);

export const ponytailSkillProvider: SkillProvider = {
	name: PROVIDER,
	list: () => Promise.resolve(CANDIDATES),
	async get(candidate): Promise<SkillDefinition | undefined> {
		const skill = BUNDLED.find((item) => item.name === candidate.name);
		if (skill === undefined) return undefined;
		const listed = candidateOf(skill);
		return {
			name: listed.name,
			description: listed.description,
			invocation: listed.invocation,
			provider: listed.provider,
			source: listed.source,
			resourceBase: listed.resourceBase,
			content: await readFile(skillPath(skill.file), "utf8"),
		};
	},
};

/** 把 5 个一次性 skill 挂到 ctx.skills。 */
export function registerSkills(ctx: Context): void {
	ctx.skills.registerProvider(() => ponytailSkillProvider);
}

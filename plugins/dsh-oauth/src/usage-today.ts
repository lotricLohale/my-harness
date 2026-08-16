import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { StreamChunk, TokenUsage } from "@deepseek-ai/dsh-llm";

export interface TodayUsage {
	date: string;
	models: Record<string, number>;
}

/** 本地日历日，跨日清零。 */
export function localDate(now = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function tokenTotal(usage: TokenUsage): number {
	return (
		usage.inputTokens +
		usage.outputTokens +
		(usage.cacheReadTokens ?? 0) +
		(usage.cacheWriteTokens ?? 0) +
		(usage.reasoningTokens ?? 0)
	);
}

export function usageFilePath(): string {
	return (
		process.env.MDSH_USAGE_FILE ??
		join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "token-usage.json")
	);
}

export function emptyUsage(date = localDate()): TodayUsage {
	return { date, models: {} };
}

export function loadUsage(raw: string, today = localDate()): TodayUsage {
	try {
		const parsed = JSON.parse(raw) as Partial<TodayUsage>;
		if (
			parsed.date !== today ||
			parsed.models === undefined ||
			typeof parsed.models !== "object"
		) {
			return emptyUsage(today);
		}
		const models: Record<string, number> = {};
		for (const [name, value] of Object.entries(parsed.models)) {
			if (typeof value === "number" && Number.isFinite(value) && value > 0) {
				models[name] = value;
			}
		}
		return { date: today, models };
	} catch {
		return emptyUsage(today);
	}
}

export function addModelUsage(
	state: TodayUsage,
	model: string,
	tokens: number,
	today = localDate(),
): TodayUsage {
	const next = state.date === today ? state : emptyUsage(today);
	if (tokens <= 0 || model.length === 0) return next;
	return {
		date: today,
		models: {
			...next.models,
			[model]: (next.models[model] ?? 0) + tokens,
		},
	};
}

export function visibleModels(state: TodayUsage): Array<[string, number]> {
	return Object.entries(state.models)
		.filter(([, tokens]) => tokens > 0)
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		);
}

function readUsage(path: string): TodayUsage {
	try {
		return loadUsage(readFileSync(path, "utf8"));
	} catch {
		return emptyUsage();
	}
}

function writeUsage(path: string, state: TodayUsage): void {
	writeFileSync(path, `${JSON.stringify(state)}\n`);
}

/** 在 llm/stream 上累计今日按模型 token，失败不影响请求。 */
export function registerTodayUsage(ctx: Context): void {
	const path = usageFilePath();
	ctx.on("llm/stream", (options, next) => {
		const model =
			typeof options === "object" &&
			options !== null &&
			"model" in options &&
			typeof options.model === "string"
				? options.model
				: "";
		return track(path, model, next());
	});
}

async function* track(
	path: string,
	model: string,
	stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
	for await (const chunk of stream) {
		if (chunk.type === "usage") {
			try {
				const tokens = tokenTotal(chunk.usage);
				if (tokens > 0 && model.length > 0) {
					writeUsage(path, addModelUsage(readUsage(path), model, tokens));
				}
			} catch {
				// 用量文件写失败只丢掉统计，模型请求必须继续。
			}
		}
		yield chunk;
	}
}

import { writeFileSync } from "node:fs";
import type { Context } from "@deepseek-ai/cordis";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";

type Activity = "idle" | "running" | "error";

/** 将模型请求状态写给 MDSH 状态栏，不让状态上报影响模型请求。 */
export function registerModelActivity(ctx: Context): void {
	const path = process.env["MDSH_STATUS_FILE"];
	if (path === undefined) return;
	let active = 0;
	let failed = false;
	const report = (activity: Activity): void => {
		try {
			writeFileSync(path, activity);
		} catch {
			// 状态文件不可写时只失去桌面动画，模型请求必须继续。
		}
	};
	const track = async function* (
		stream: AsyncIterable<StreamChunk>,
	): AsyncIterable<StreamChunk> {
		if (active === 0) failed = false;
		active += 1;
		report("running");
		try {
			for await (const chunk of stream) {
				if (chunk.type === "finish" && chunk.reason.kind === "error")
					failed = true;
				yield chunk;
			}
		} catch (error) {
			failed = true;
			throw error;
		} finally {
			active -= 1;
			const nextActivity: Activity =
				active > 0 ? "running" : failed ? "error" : "idle";
			report(nextActivity);
		}
	};
	ctx.on("llm/stream", (_options, next) => track(next()));
}

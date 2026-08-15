import { CallId, EMPTY_RESPONSE_CODE, LlmError } from "@deepseek-ai/dsh-llm";
import type {
	FinishReason,
	StreamChunk,
	TokenUsage,
} from "@deepseek-ai/dsh-llm";
import type {
	AssistantMessage,
	AssistantMessageEvent,
	Usage,
} from "@earendil-works/pi-ai";
import { toReplayState } from "./replay.js";

/** 将 pi-ai 累计用量转换成 Harness 用量字段。 */
export function mapUsage(usage: Usage): TokenUsage {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		...(usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {}),
		...(usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}),
	};
}

/** 将 xAI 的终止原因转换成 Harness 协议。 */
export function mapStopReason(message: AssistantMessage): FinishReason {
	switch (message.stopReason) {
		case "stop":
			return message.content.length === 0
				? {
						kind: "error",
						failure: {
							message: "xAI returned an empty response",
							code: EMPTY_RESPONSE_CODE,
						},
					}
				: { kind: "stop" };
		case "length":
			return { kind: "max-tokens" };
		case "toolUse":
			return { kind: "tool-calls" };
		case "aborted":
			return {
				kind: "aborted",
				failure: {
					message: message.errorMessage ?? "xAI request aborted",
					code: "ABORTED",
				},
			};
		case "error":
			return {
				kind: "error",
				failure: {
					message: message.errorMessage ?? "xAI request failed",
					code: "XAI_ERROR",
				},
			};
		case "pending":
		case "deferred":
		default:
			return {
				kind: "error",
				failure: {
					message: `xAI ended with unsupported state ${String(message.stopReason)}`,
					code: "XAI_ERROR",
				},
			};
	}
}

/** 将 pi-ai 事件流转换成完整的 Harness StreamChunk 序列。 */
export async function* toStreamChunks(
	events: AsyncIterable<AssistantMessageEvent>,
): AsyncGenerator<StreamChunk> {
	const calls = new Map<number, { id: string; name: string }>();
	for await (const event of events) {
		switch (event.type) {
			case "start":
				break;
			case "text_start":
				yield {
					type: "block-start",
					index: event.contentIndex,
					blockType: "text",
				};
				break;
			case "text_delta":
				yield {
					type: "text-delta",
					index: event.contentIndex,
					text: event.delta,
				};
				break;
			case "text_end":
				yield {
					type: "block-end",
					index: event.contentIndex,
					block: { type: "text", text: event.content },
				};
				break;
			case "thinking_start":
				yield {
					type: "block-start",
					index: event.contentIndex,
					blockType: "reasoning",
				};
				break;
			case "thinking_delta":
				yield {
					type: "reasoning-delta",
					index: event.contentIndex,
					text: event.delta,
				};
				break;
			case "thinking_end":
				yield {
					type: "block-end",
					index: event.contentIndex,
					block: { type: "reasoning", text: event.content },
				};
				break;
			case "toolcall_start": {
				const partial = event.partial.content[event.contentIndex];
				calls.set(event.contentIndex, {
					id: partial?.type === "toolCall" ? partial.id : "",
					name: partial?.type === "toolCall" ? partial.name : "",
				});
				yield {
					type: "block-start",
					index: event.contentIndex,
					blockType: "tool-call",
				};
				break;
			}
			case "toolcall_delta": {
				const call = calls.get(event.contentIndex);
				yield {
					type: "tool-call-delta",
					index: event.contentIndex,
					id: CallId(call?.id ?? ""),
					...(call?.name ? { name: call.name } : {}),
					argumentsDelta: event.delta,
				};
				break;
			}
			case "toolcall_end":
				yield {
					type: "block-end",
					index: event.contentIndex,
					block: {
						type: "tool-call",
						id: CallId(event.toolCall.id),
						name: event.toolCall.name,
						arguments: JSON.stringify(event.toolCall.arguments),
					},
				};
				break;
			case "done":
				yield { type: "usage", usage: mapUsage(event.message.usage) };
				yield {
					type: "finish",
					reason: mapStopReason(event.message),
					replayState: toReplayState(event.message),
				};
				return;
			case "error":
				yield { type: "usage", usage: mapUsage(event.error.usage) };
				yield { type: "finish", reason: mapStopReason(event.error) };
				return;
			default:
				break;
		}
	}
	throw new LlmError(
		"xAI stream ended without a terminal event",
		"STREAM_CLOSED",
	);
}

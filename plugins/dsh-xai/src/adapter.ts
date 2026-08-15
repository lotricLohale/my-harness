import { randomUUID } from "node:crypto";
import {
	attributionHeaders,
	LlmAdapter,
	LlmError,
	ReasoningEffortId,
} from "@deepseek-ai/dsh-llm";
import type {
	GenerateOptions,
	LlmModelInfo,
	LlmResolvedModelInfo,
	StreamChunk,
} from "@deepseek-ai/dsh-llm";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/compat";
import type { XaiAccountMeta, XaiAuth } from "./auth.js";
import { toPiContext } from "./context.js";
import { findXaiModel, KNOWN_XAI_MODELS } from "./models.js";
import { toStreamChunks } from "./stream.js";

function isModelVisible(chunk: StreamChunk): boolean {
	return chunk.type !== "usage" && chunk.type !== "finish";
}

/** 判断上游错误是否明确表示账号限额或速率限制。 */
export function isQuotaError(error: unknown): boolean {
	const code =
		(error as { status?: unknown; statusCode?: unknown; code?: unknown } | null)
			?.status ??
		(error as { statusCode?: unknown } | null)?.statusCode ??
		(error as { code?: unknown } | null)?.code;
	const text = error instanceof Error ? error.message : String(error);
	return (
		code === 429 ||
		/quota reached|individual quota reached|rate limited|credits exhausted|insufficient credits|exceeded quota/i.test(
			text,
		)
	);
}

/** 针对 xAI Responses API 对 payload 进行微调与兼容。 */
function rewriteXaiPayload(
	payload: unknown,
	_modelId: string,
	sessionId?: string,
): unknown {
	if (!payload || typeof payload !== "object") return payload;
	const body: Record<string, unknown> = {
		...(payload as Record<string, unknown>),
	};

	if (Array.isArray(body["input"])) {
		const input = [...body["input"]];
		const instructionParts: string[] = [];

		while (input.length > 0) {
			const first = input[0];
			if (!first || typeof first !== "object" || Array.isArray(first)) break;
			const item = first as Record<string, unknown>;
			if (item["role"] !== "developer" && item["role"] !== "system") break;
			const content = item["content"];
			if (typeof content === "string") {
				instructionParts.push(content.trim());
			} else if (Array.isArray(content)) {
				for (const part of content) {
					if (
						part &&
						typeof part === "object" &&
						!Array.isArray(part) &&
						typeof (part as Record<string, unknown>)["text"] === "string"
					) {
						instructionParts.push(
							((part as Record<string, unknown>)["text"] as string).trim(),
						);
					}
				}
			}
			input.shift();
		}

		if (instructionParts.length > 0) {
			const existing =
				typeof body["instructions"] === "string" ? body["instructions"] : "";
			body["instructions"] = [existing, ...instructionParts]
				.filter(Boolean)
				.join("\n\n");
		}
		body["input"] = input;
	}

	if (body["reasoning"] && typeof body["reasoning"] === "object") {
		const effort = (body["reasoning"] as Record<string, unknown>)["effort"];
		if (typeof effort === "string" && effort !== "none") {
			body["reasoning"] = { effort: effort === "minimal" ? "low" : effort };
		} else {
			delete body["reasoning"];
		}
	}

	delete body["prompt_cache_retention"];
	const cacheKey =
		(typeof body["prompt_cache_key"] === "string" &&
			body["prompt_cache_key"].trim()) ||
		sessionId ||
		"";
	if (cacheKey) body["prompt_cache_key"] = cacheKey;
	else delete body["prompt_cache_key"];

	return body;
}

/** 把 xAI provider 接入 Harness LLM seam。 */
export class XaiAdapter extends LlmAdapter {
	private readonly streamSimple = openAIResponsesApi().streamSimple;

	constructor(private readonly auth: XaiAuth) {
		super();
	}

	override providerInfo(provider: string) {
		return { id: provider, name: "xAI (OAuth)" };
	}

	override async listModels(
		provider: string,
	): Promise<readonly LlmModelInfo[]> {
		this.assertProvider(provider);
		if ((await this.auth.candidates()).length === 0) return [];
		return KNOWN_XAI_MODELS.map((model) => ({
			provider,
			id: model.id,
			name: model.name,
			inputModalities: [...model.input],
		}));
	}

	override resolveModel(
		provider: string,
		modelId: string,
	): Promise<LlmResolvedModelInfo> {
		this.assertProvider(provider);
		const model = this.model(modelId);
		const levels = getSupportedThinkingLevels(model);
		return Promise.resolve({
			provider,
			id: model.id,
			name: model.name,
			inputModalities: [...model.input],
			context: { contextWindow: model.contextWindow },
			...(model.reasoning
				? {
						reasoning: {
							efforts: levels.map((level) => ({
								id: ReasoningEffortId(level),
								name: level.charAt(0).toUpperCase() + level.slice(1),
							})),
						},
					}
				: {}),
		});
	}

	override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
		this.assertProvider(options.provider);
		if (options.stop !== undefined) {
			throw new LlmError(
				"xAI does not support GenerateOptions.stop",
				"UNSUPPORTED_OPTION",
			);
		}

		const accounts = await this.auth.candidates();
		if (accounts.length === 0) {
			throw new LlmError(
				"xAI has no enabled account; run /xai-login or /xai-accounts",
				"MISSING_CREDENTIAL",
			);
		}

		let lastQuota: unknown;
		for (let index = 0; index < accounts.length; index += 1) {
			const account = accounts[index]!;
			let yieldedVisible = false;
			let switched = false;
			const pending: StreamChunk[] = [];
			try {
				for await (const chunk of this.streamWithAccount(options, account)) {
					if (!yieldedVisible) {
						if (
							chunk.type === "finish" &&
							chunk.reason.kind === "error" &&
							isQuotaError(chunk.reason.failure.message)
						) {
							lastQuota = chunk.reason.failure.message;
							await this.auth.markExhausted(account);
							switched = true;
							break;
						}
						if (!isModelVisible(chunk)) {
							pending.push(chunk);
							continue;
						}
						yieldedVisible = true;
						for (const buffered of pending) yield buffered;
						pending.length = 0;
					}
					yield chunk;
				}
				if (switched) {
					if (index + 1 < accounts.length) continue;
					break;
				}
				for (const buffered of pending) yield buffered;
				return;
			} catch (error) {
				if (!yieldedVisible && isQuotaError(error)) {
					lastQuota = error;
					await this.auth.markExhausted(account);
					if (index + 1 < accounts.length) continue;
					break;
				}
				throw error;
			}
		}

		throw new LlmError(
			`All xAI accounts are rate-limited or exhausted; last error: ${lastQuota instanceof Error ? lastQuota.message : String(lastQuota ?? "unknown")}`,
			"RATE_LIMITED",
		);
	}

	private async *streamWithAccount(
		options: GenerateOptions,
		account: XaiAccountMeta,
	): AsyncIterable<StreamChunk> {
		const model = this.model(options.model, options.provider);
		const apiKey = await this.auth.apiKeyFor(account);
		const reasoning = this.reasoning(model, options.reasoningEffort);
		const sessionId = options.sessionId
			? String(options.sessionId)
			: randomUUID();

		const requestHeaders: Record<string, string> = {
			...attributionHeaders(),
			"User-Agent": "dsh-xai/0.1.0",
			"x-grok-client-identifier": "dsh-xai",
			"x-grok-client-version": "1.5.0",
			"X-XAI-Token-Auth": "xai-grok-cli",
			"x-authenticateresponse": "authenticate-response",
			"x-grok-client-mode": "interactive",
			"x-grok-conv-id": sessionId,
			"x-grok-req-id": randomUUID(),
			"x-grok-model-override": options.model,
			"x-grok-session-id": sessionId,
		};

		const events = this.streamSimple(
			model as Model<"openai-responses">,
			toPiContext(options),
			{
				apiKey,
				...(reasoning === undefined || reasoning === "off"
					? {}
					: { reasoning }),
				...(options.temperature === undefined
					? {}
					: { temperature: options.temperature }),
				...(options.maxTokens === undefined
					? {}
					: { maxTokens: options.maxTokens }),
				sessionId,
				signal: options.signal,
				headers: requestHeaders,
				maxRetries: 0,
				onPayload: (payload) =>
					rewriteXaiPayload(payload, options.model, sessionId),
			},
		);

		yield* toStreamChunks(events);
	}

	private assertProvider(provider: string): void {
		if (
			provider !== "xai-oauth" &&
			provider !== "xai-auth" &&
			provider !== "xai"
		) {
			throw new LlmError(
				`xAI adapter does not own provider "${provider}"`,
				"NO_ADAPTER",
			);
		}
	}

	private model(id: string, provider = "xai-oauth"): Model<Api> {
		const config = findXaiModel(id);
		if (config === undefined) {
			throw new LlmError(`xAI has no model "${id}"`, "UNKNOWN_MODEL");
		}
		return {
			...config,
			provider,
			api: "openai-responses",
			baseUrl: "https://cli-chat-proxy.grok.com/v1",
		} as Model<Api>;
	}

	private reasoning(
		model: Model<Api>,
		effort: string | undefined,
	): ModelThinkingLevel | undefined {
		if (effort === undefined) return undefined;
		const supported = getSupportedThinkingLevels(model);
		if (supported.some((level) => level === effort))
			return effort as ModelThinkingLevel;
		throw new LlmError(
			`xAI model "${model.id}" does not support reasoning effort "${effort}"`,
			"UNSUPPORTED_REASONING_EFFORT",
		);
	}
}

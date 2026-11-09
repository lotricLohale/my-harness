import {
	attributionHeaders,
	contentHasImage,
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
import type {
	AttachmentStore,
	ImageAttachmentRef,
} from "@deepseek-ai/dsh-attachment";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type {
	Api,
	Context as PiContext,
	Model,
	ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import { autoRetryEnabled } from "../../auto-retry.js";
import type { AntigravityAccountMeta, AntigravityAuth } from "./auth.js";
import { toPiContext } from "./context.js";
import { toStreamChunks } from "./stream.js";
import type {
	AntigravityModelConfig,
	AntigravityProvider,
} from "./upstream.js";

export interface AntigravityAdapterOptions {
	resolveAttachments?: () => AttachmentStore | undefined;
	resolveImageAccess?: (
		attachments: AttachmentStore,
		ref: ImageAttachmentRef,
	) => { readonlyPath: string } | undefined;
	refreshModels?: (apiKey: string) => Promise<readonly AntigravityModelConfig[]>;
}

function isModelVisible(chunk: StreamChunk): boolean {
	return chunk.type !== "usage" && chunk.type !== "finish";
}

const THINKING_ID_SUFFIX =
	/-(extra-low|extra-high|thinking|minimal|medium|high|low)$/i;

function publicModelId(id: string): string {
	return id.replace(THINKING_ID_SUFFIX, "");
}

/** Fold thinking-tier runtime ids into one picker row, e.g. gemini-4-argon + gemini-4-argon-medium. */
function collapsePublicModels(
	models: readonly AntigravityModelConfig[],
): AntigravityModelConfig[] {
	const collapsed = new Map<string, AntigravityModelConfig>();
	for (const model of models) {
		const id = publicModelId(model.id);
		const previous = collapsed.get(id);
		if (previous === undefined || model.id === id) {
			collapsed.set(id, model.id === id ? model : { ...model, id });
		}
	}
	return [...collapsed.values()];
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** 判断上游错误是否明确表示账号限额或速率限制。 */
export function isQuotaError(error: unknown): boolean {
	const code =
		(error as { status?: unknown; statusCode?: unknown; code?: unknown } | null)
			?.status ??
		(error as { statusCode?: unknown } | null)?.statusCode ??
		(error as { code?: unknown } | null)?.code;
	const text = errorText(error);
	return (
		code === 429 ||
		/quota reached|individual quota reached|rate limited/i.test(text)
	);
}

/** 传输层瞬时失败：代理 RST、空闲 socket、DNS/TCP 在拿到 HTTP 状态前就断了。 */
export function isTransientFetchError(error: unknown): boolean {
	return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|UND_ERR_|other side closed|socket hang up|network/i.test(
		errorText(error),
	);
}

function finishErrorMessage(chunk: StreamChunk): string | undefined {
	if (chunk.type !== "finish" || chunk.reason.kind !== "error") return undefined;
	return chunk.reason.failure.message;
}

/** 把 pi-antigravity provider 接入 Harness LLM seam。 */
export class AntigravityAdapter extends LlmAdapter {
	private liveModels: readonly AntigravityModelConfig[] | undefined;
	private liveModelsAt = 0;

	constructor(
		private readonly provider: AntigravityProvider,
		private readonly auth: AntigravityAuth,
		private readonly options?: AntigravityAdapterOptions,
	) {
		super();
	}

	override providerInfo(provider: string) {
		return { id: provider, name: this.provider.name ?? "Antigravity" };
	}

	override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
		this.assertProvider(provider);
		const accounts = await this.auth.candidates();
		if (accounts.length === 0) return [];
		return (await this.models(accounts[0])).map((model) => ({
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
				"Antigravity does not support GenerateOptions.stop",
				"UNSUPPORTED_OPTION",
			);
		}
		const streamSimple = this.provider.streamSimple;
		if (streamSimple === undefined) {
			throw new LlmError(
				"pi-antigravity registered no streamSimple implementation",
				"NO_ADAPTER",
			);
		}
		const accounts = await this.auth.candidates();
		if (accounts.length === 0) {
			throw new LlmError(
				"Antigravity has no enabled account; run /antigravity-login or /antigravity-accounts",
				"MISSING_CREDENTIAL",
			);
		}
		const model = this.model(options.model);
		const containsImage = options.messages.some((message) =>
			contentHasImage(message.content),
		);
		if (containsImage && !model.input.includes("image")) {
			throw new LlmError(
				`Antigravity model "${model.id}" does not support image input`,
				"UNSUPPORTED_CONTENT",
			);
		}
		const attachments = containsImage
			? this.options?.resolveAttachments?.()
			: undefined;
		if (containsImage && !attachments) {
			throw new LlmError(
				"Antigravity image input requires the durable attachment service",
				"UNSUPPORTED_CONTENT",
			);
		}
		const imageContext = attachments
			? {
					attachments,
					resolveImageAccess: this.options?.resolveImageAccess,
				}
			: undefined;
		const context = imageContext
			? await toPiContext(options, imageContext)
			: toPiContext(options);
		let lastQuota: unknown;
		for (let index = 0; index < accounts.length; index += 1) {
			const account = accounts[index]!;
			let fetchRetries = 0;
			let switched = false;
			retry: while (true) {
				let yieldedVisible = false;
				switched = false;
				const pending: StreamChunk[] = [];
				try {
					for await (const chunk of this.streamWithAccount(
						options,
						account,
						context,
					)) {
						if (!yieldedVisible) {
							const failure = finishErrorMessage(chunk);
							if (failure !== undefined && isQuotaError(failure)) {
								lastQuota = failure;
								await this.auth.markExhausted(account);
								switched = true;
								break;
							}
							if (
								failure !== undefined &&
								isTransientFetchError(failure) &&
								fetchRetries < (autoRetryEnabled() ? 2 : 1) &&
								options.signal?.aborted !== true
							) {
								fetchRetries += 1;
								continue retry;
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
					if (switched) break;
					for (const buffered of pending) yield buffered;
					return;
				} catch (error) {
					if (
						!yieldedVisible &&
						isTransientFetchError(error) &&
						fetchRetries < (autoRetryEnabled() ? 2 : 1) &&
						options.signal?.aborted !== true
					) {
						fetchRetries += 1;
						continue;
					}
					if (!yieldedVisible && isQuotaError(error)) {
						lastQuota = error;
						await this.auth.markExhausted(account);
						switched = true;
						break;
					}
					throw error;
				}
			}
			if (switched) {
				if (index + 1 < accounts.length) continue;
				break;
			}
		}
		throw new LlmError(
			`All Antigravity accounts are rate-limited or exhausted; last error: ${lastQuota instanceof Error ? lastQuota.message : String(lastQuota ?? "unknown")}`,
			"RATE_LIMITED",
		);
	}

	private async *streamWithAccount(
		options: GenerateOptions,
		account: AntigravityAccountMeta,
		context: PiContext,
	): AsyncIterable<StreamChunk> {
		const streamSimple = this.provider.streamSimple;
		if (streamSimple === undefined)
			throw new LlmError(
				"pi-antigravity registered no streamSimple implementation",
				"NO_ADAPTER",
			);
		const model = this.model(options.model);
		const apiKey = await this.auth.apiKeyFor(account);
		const reasoning = this.reasoning(model, options.reasoningEffort);
		const events = streamSimple(model, context, {
			apiKey,
			...(reasoning === undefined || reasoning === "off" ? {} : { reasoning }),
			...(options.temperature === undefined
				? {}
				: { temperature: options.temperature }),
			...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
			...(options.sessionId === undefined
				? {}
				: { sessionId: String(options.sessionId) }),
			signal: options.signal,
			headers: attributionHeaders(),
			maxRetries: 0,
		});
		yield* toStreamChunks(events);
	}

	private assertProvider(provider: string): void {
		if (provider !== "antigravity") {
			throw new LlmError(
				`Antigravity adapter does not own provider "${provider}"`,
				"NO_ADAPTER",
			);
		}
	}

	private async models(
		account?: AntigravityAccountMeta,
	): Promise<readonly AntigravityModelConfig[]> {
		const refresh = this.options?.refreshModels;
		const ttlMs = 5 * 60 * 1000;
		if (
			refresh === undefined ||
			(this.liveModels !== undefined && Date.now() - this.liveModelsAt < ttlMs)
		) {
			return this.liveModels ?? this.provider.models;
		}
		const chosen = account ?? (await this.auth.candidates())[0];
		if (chosen === undefined) return this.provider.models;
		try {
			const next = await refresh(await this.auth.apiKeyFor(chosen));
			if (next.length > 0) {
				this.liveModels = collapsePublicModels(next);
				this.liveModelsAt = Date.now();
				return this.liveModels;
			}
		} catch {
			// Keep the last good / static catalog if live discovery fails.
		}
		return collapsePublicModels(this.liveModels ?? this.provider.models);
	}

	private model(id: string): Model<Api> {
		const models = this.liveModels ?? this.provider.models;
		const publicId = publicModelId(id);
		const config = models.find(
			(model) => model.id === id || model.id === publicId,
		);
		if (config === undefined) {
			throw new LlmError(`Antigravity has no model "${id}"`, "UNKNOWN_MODEL");
		}
		return {
			...config,
			provider: "antigravity",
			api: this.provider.api,
			baseUrl: this.provider.baseUrl,
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
			`Antigravity model "${model.id}" does not support reasoning effort "${effort}"`,
			"UNSUPPORTED_REASONING_EFFORT",
		);
	}
}

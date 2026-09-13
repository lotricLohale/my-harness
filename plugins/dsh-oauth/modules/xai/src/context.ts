import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type {
	ContentBlock,
	GenerateOptions,
	Message,
} from "@deepseek-ai/dsh-llm";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import type {
	Context as PiContext,
	ImageContent,
	Message as PiMessage,
	TextContent,
	Tool as PiTool,
} from "@earendil-works/pi-ai";
import { toPiAssistant } from "./replay.js";

const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;

/** Plugin SDK types lag core; runtime store may also expose readImageRequest. */
export interface ImageBytesStore {
	readImage(
		ref: ImageAttachmentRef,
		signal?: AbortSignal,
	): Promise<{ data: Uint8Array; mediaType?: string }>;
	readImageRequest?(
		ref: ImageAttachmentRef,
		policy: { maxPixels: number; maxBytes: number },
		signal?: AbortSignal,
	): Promise<{ data: Uint8Array; mediaType: string }>;
	imageHostPath?(ref: ImageAttachmentRef): string | undefined;
}

export interface PiImageRequestContext {
	attachments: ImageBytesStore;
	resolveImageAccess?: (
		attachments: ImageBytesStore,
		ref: ImageAttachmentRef,
	) => { readonlyPath: string } | undefined;
}

function flattenText(message: Message): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

function resultText(blocks: readonly ContentBlock[]): string {
	return blocks
		.map((block) =>
			block.type === "text"
				? block.text
				: block.type === "tool-result"
					? resultText(block.content)
					: "",
		)
		.join("");
}

function toolsOf(options: GenerateOptions): PiTool[] | undefined {
	return options.tools?.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	}));
}

function imageHandleText(
	ref: ImageAttachmentRef,
	access?: { readonlyPath: string },
): string {
	const identity = ref.name
		? `"${ref.name}" (${ref.attachmentId})`
		: String(ref.attachmentId);
	const preview = `Image ${identity}; request preview ${ref.width}x${ref.height}px.`;
	if (!access) return preview;
	return `${preview} Normalized copy (read-only): "${access.readonlyPath}" (${ref.width}x${ref.height}px, ${ref.mediaType}).`;
}

async function prepareImage(
	attachments: ImageBytesStore,
	ref: ImageAttachmentRef,
	signal?: AbortSignal,
): Promise<{ data: string; mimeType: string } | undefined> {
	if (typeof attachments.readImageRequest === "function") {
		try {
			const request = await attachments.readImageRequest(
				ref,
				{
					maxPixels: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
					maxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
				},
				signal,
			);
			return {
				data: Buffer.from(request.data).toString("base64"),
				mimeType: request.mediaType,
			};
		} catch {
			// fall through to stored image
		}
	}
	try {
		const stored = await attachments.readImage(ref, signal);
		return {
			data: Buffer.from(stored.data).toString("base64"),
			mimeType: stored.mediaType ?? ref.mediaType,
		};
	} catch {
		return undefined;
	}
}

async function processBlocks(
	blocks: readonly ContentBlock[],
	attachments: ImageBytesStore,
	resolveImageAccess?: (
		attachments: ImageBytesStore,
		ref: ImageAttachmentRef,
	) => { readonlyPath: string } | undefined,
	signal?: AbortSignal,
): Promise<Array<TextContent | ImageContent>> {
	const result: Array<TextContent | ImageContent> = [];
	for (const block of blocks) {
		switch (block.type) {
			case "text":
				if (block.text.length > 0) {
					result.push({ type: "text", text: block.text });
				}
				break;
			case "image": {
				const image = await prepareImage(attachments, block.attachment, signal);
				const access = resolveImageAccess?.(attachments, block.attachment);
				const handle = imageHandleText(block.attachment, access);
				if (image) {
					result.push({ type: "text", text: handle });
					result.push({
						type: "image",
						data: image.data,
						mimeType: image.mimeType,
					});
				} else {
					result.push({
						type: "text",
						text: `[${handle} could not be loaded from attachment storage]`,
					});
				}
				break;
			}
			case "tool-result": {
				const nested = await processBlocks(
					block.content,
					attachments,
					resolveImageAccess,
					signal,
				);
				result.push(...nested);
				break;
			}
			default:
				break;
		}
	}
	return result;
}

function textOnlyContext(options: GenerateOptions): PiContext {
	const toolNames = new Map<string, string>();
	const messages: PiMessage[] = [];
	for (const message of options.messages) {
		if (contentHasImage(message.content)) {
			throw new LlmError(
				"xAI image input requires the durable attachment service",
				"UNSUPPORTED_CONTENT",
			);
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message);
			for (const block of assistant.content) {
				if (block.type === "toolCall") toolNames.set(block.id, block.name);
			}
			messages.push(assistant);
			continue;
		}
		const text = flattenText(message);
		const results = message.content.filter(
			(block) => block.type === "tool-result",
		);
		if (text.length > 0 || results.length === 0) {
			messages.push({ role: "user", content: text, timestamp: 0 });
		}
		for (const result of results) {
			messages.push({
				role: "toolResult",
				toolCallId: result.toolCallId,
				toolName: toolNames.get(result.toolCallId) ?? "unknown",
				content: [
					{ type: "text", text: resultText(result.content) || "(no output)" },
				],
				isError: result.isError ?? false,
				timestamp: 0,
			});
		}
	}
	const tools = toolsOf(options);
	return {
		...(options.system === undefined ? {} : { systemPrompt: options.system }),
		messages,
		...(tools === undefined || tools.length === 0 ? {} : { tools }),
	};
}

async function toPiContextWithImages(
	options: GenerateOptions,
	images: PiImageRequestContext,
): Promise<PiContext> {
	const { attachments, resolveImageAccess } = images;
	const toolNames = new Map<string, string>();
	const messages: PiMessage[] = [];

	for (const message of options.messages) {
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message);
			for (const block of assistant.content) {
				if (block.type === "toolCall") toolNames.set(block.id, block.name);
			}
			messages.push(assistant);
			continue;
		}
		if (message.role === "system") {
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0,
			});
			continue;
		}

		const regular = message.content.filter(
			(block) => block.type !== "tool-result",
		);
		const processedRegular = await processBlocks(
			regular,
			attachments,
			resolveImageAccess,
			options.signal,
		);
		const results = message.content.filter(
			(block) => block.type === "tool-result",
		);

		if (processedRegular.every((b) => b.type === "text")) {
			const text = processedRegular.map((b) => b.text).join("");
			if (text.length > 0 || results.length === 0) {
				messages.push({ role: "user", content: text, timestamp: 0 });
			}
		} else {
			messages.push({ role: "user", content: processedRegular, timestamp: 0 });
		}

		for (const result of results) {
			const processed = await processBlocks(
				result.content,
				attachments,
				resolveImageAccess,
				options.signal,
			);
			const hasImage = processed.some((b) => b.type === "image");
			const content: Array<TextContent | ImageContent> = hasImage
				? processed
				: [
						{
							type: "text",
							text:
								processed.map((b) => (b.type === "text" ? b.text : "")).join("") ||
								"(no output)",
						},
					];
			messages.push({
				role: "toolResult",
				toolCallId: result.toolCallId,
				toolName: toolNames.get(result.toolCallId) ?? "unknown",
				content,
				isError: result.isError ?? false,
				timestamp: 0,
			});
		}
	}

	const tools = toolsOf(options);
	return {
		...(options.system === undefined ? {} : { systemPrompt: options.system }),
		messages,
		...(tools === undefined || tools.length === 0 ? {} : { tools }),
	};
}

/** 将文本、推理、工具和图片历史转换为 pi-ai Context。 */
export function toPiContext(
	options: GenerateOptions,
	images?: PiImageRequestContext,
): PiContext | Promise<PiContext> {
	const hasImage = options.messages.some((m) => contentHasImage(m.content));
	if (!hasImage) {
		return textOnlyContext(options);
	}
	if (images === undefined) {
		throw new LlmError(
			"xAI image input requires the durable attachment service",
			"UNSUPPORTED_CONTENT",
		);
	}
	return toPiContextWithImages(options, images);
}

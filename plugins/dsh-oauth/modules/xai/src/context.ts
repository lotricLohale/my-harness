import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type {
	ContentBlock,
	GenerateOptions,
	RequestMessage,
	ToolResultMessage,
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

const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;

/** Plugin SDK types lag core; runtime store may also expose readImageRequest. */
export interface ImageBytesStore {
	readImage(
		ref: ImageAttachmentRef,
		signal?: AbortSignal,
	): Promise<{ data: Uint8Array; mediaType?: string }>;
	readImageRequest?(
		ref: ImageAttachmentRef,
		target: { width: number; height: number; maxBytes: number },
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

function flattenText(message: { content: readonly ContentBlock[] }): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

function isToolResult(message: RequestMessage): message is ToolResultMessage {
	return message.role === "tool";
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
					width: ref.width,
					height: ref.height,
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
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message);
			for (const block of assistant.content) {
				if (block.type === "toolCall") toolNames.set(block.id, block.name);
			}
			messages.push(assistant);
			continue;
		}
		if (isToolResult(message)) {
			messages.push({
				role: "toolResult",
				toolCallId: message.toolCallId,
				toolName: toolNames.get(message.toolCallId) ?? "unknown",
				content: [
					{ type: "text", text: flattenText(message) || "(no output)" },
				],
				isError: message.isError ?? false,
				timestamp: 0,
			});
			continue;
		}
		if (contentHasImage(message.content)) {
			throw new LlmError(
				"xAI image input requires the durable attachment service",
				"UNSUPPORTED_CONTENT",
			);
		}
		messages.push({ role: "user", content: flattenText(message), timestamp: 0 });
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
		if (isToolResult(message)) {
			const processed = await processBlocks(
				message.content,
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
				toolCallId: message.toolCallId,
				toolName: toolNames.get(message.toolCallId) ?? "unknown",
				content,
				isError: message.isError ?? false,
				timestamp: 0,
			});
			continue;
		}
		if (message.role === "system" || message.role === "developer") {
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0,
			});
			continue;
		}

		const processedRegular = await processBlocks(
			message.content,
			attachments,
			resolveImageAccess,
			options.signal,
		);
		if (processedRegular.every((b) => b.type === "text")) {
			messages.push({
				role: "user",
				content: processedRegular.map((b) => b.text).join(""),
				timestamp: 0,
			});
		} else {
			messages.push({ role: "user", content: processedRegular, timestamp: 0 });
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

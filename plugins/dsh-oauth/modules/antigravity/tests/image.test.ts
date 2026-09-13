import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateOptions } from "@deepseek-ai/dsh-llm";
import type {
	AssistantMessage,
	AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import { AntigravityAdapter } from "../src/adapter.js";
import { toPiContext } from "../src/context.js";

function message(text = "ok"): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "antigravity-api",
		provider: "antigravity",
		model: "gemini-3.8-flash",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

async function* okEvents(text = "ok"): AsyncGenerator<AssistantMessageEvent> {
	const done = message(text);
	yield { type: "start", partial: { ...done, content: [] } };
	yield { type: "text_start", contentIndex: 0, partial: done };
	yield { type: "text_delta", contentIndex: 0, delta: text, partial: done };
	yield { type: "text_end", contentIndex: 0, content: text, partial: done };
	yield { type: "done", reason: "stop", message: done };
}

test("toPiContext: 无 attachments 时包含图片抛出 UNSUPPORTED_CONTENT", () => {
	const options: GenerateOptions = {
		provider: "antigravity",
		model: "gemini-3.8-flash",
		messages: [
			{
				role: "user",
				id: "msg-1" as never,
				content: [
					{
						type: "image",
						attachment: {
							attachmentId: "sha256:test" as never,
							mediaType: "image/png",
							bytes: 100,
							width: 100,
							height: 100,
						},
					},
				],
				source: { kind: "user" },
			},
		],
	};
	assert.throws(
		() => toPiContext(options),
		(err: unknown) => (err as { code?: string })?.code === "UNSUPPORTED_CONTENT",
	);
});

test("toPiContext: 正确将 tool-result 中的图片转换为 PiMessage ImageContent", async () => {
	const mockAttachments: never = {
		readImageRequest: async () => ({
			data: Buffer.from("fake-png-bytes"),
			mediaType: "image/png",
			width: 100,
			height: 100,
			bytes: 14,
		}),
	} as never;

	const options: GenerateOptions = {
		provider: "antigravity",
		model: "gemini-3.8-flash",
		messages: [
			{
				role: "assistant",
				id: "call-msg" as never,
				content: [
					{
						type: "tool-call",
						id: "call_123" as never,
						name: "read_image",
						arguments: '{"file_path":"test.png"}',
					},
				],
				source: {
					kind: "model",
					provider: "antigravity",
					model: "gemini-3.8-flash",
				},
			},
			{
				role: "user",
				id: "result-msg" as never,
				content: [
					{
						type: "tool-result",
						toolCallId: "call_123" as never,
						content: [
							{ type: "text", text: "image info" },
							{
								type: "image",
								attachment: {
									attachmentId: "sha256:abc" as never,
									mediaType: "image/png",
									bytes: 14,
									width: 100,
									height: 100,
									name: "test.png",
								},
							},
						],
					},
				],
				source: { kind: "tool", callId: "call_123" as never },
			},
		],
	};

	const piCtx = await toPiContext(options, { attachments: mockAttachments });
	assert.equal(piCtx.messages.length, 2);
	const toolResult = piCtx.messages[1] as {
		role: string;
		toolCallId: string;
		toolName: string;
		content: Array<{ type: string; data?: string; mimeType?: string }>;
	};
	assert.equal(toolResult.role, "toolResult");
	assert.equal(toolResult.toolCallId, "call_123");
	assert.equal(toolResult.toolName, "read_image");
	assert.equal(Array.isArray(toolResult.content), true);
	const imageBlock = toolResult.content.find((b) => b.type === "image");
	assert.ok(imageBlock);
	assert.equal(
		imageBlock?.data,
		Buffer.from("fake-png-bytes").toString("base64"),
	);
	assert.equal(imageBlock?.mimeType, "image/png");
});

test("AntigravityAdapter.stream: 包含图片时正常流式返回", async () => {
	let capturedContext: { messages: Array<{ role: string; content: unknown }> } | undefined;
	const provider: never = {
		models: [
			{
				id: "gemini-3.8-flash",
				name: "Gemini",
				input: ["text", "image"],
				contextWindow: 65536,
				maxTokens: 4096,
			},
		],
		streamSimple: (_m: unknown, ctx: { messages: Array<{ role: string; content: unknown }> }) => {
			capturedContext = ctx;
			return okEvents("saw image");
		},
	} as never;
	const auth: never = {
		candidates: async () => [
			{ id: "acc-1", credentialRef: "ref-1", enabled: true, priority: 0 },
		],
		apiKeyFor: async () => "test-api-key",
	} as never;
	const mockAttachments: never = {
		readImageRequest: async () => ({
			data: Buffer.from("png-bytes"),
			mediaType: "image/png",
			width: 100,
			height: 100,
			bytes: 9,
		}),
	} as never;

	const adapter = new AntigravityAdapter(provider, auth, {
		resolveAttachments: () => mockAttachments,
	});

	const options: GenerateOptions = {
		provider: "antigravity",
		model: "gemini-3.8-flash",
		messages: [
			{
				role: "user",
				id: "msg-1" as never,
				content: [
					{
						type: "image",
						attachment: {
							attachmentId: "sha256:xyz" as never,
							mediaType: "image/png",
							bytes: 9,
							width: 100,
							height: 100,
						},
					},
				],
				source: { kind: "user" },
			},
		],
	};

	const chunks = [];
	for await (const chunk of adapter.stream(options)) {
		chunks.push(chunk);
	}

	assert.ok(capturedContext);
	assert.equal(capturedContext.messages.length, 1);
	const userMsg = capturedContext.messages[0];
	assert.equal(userMsg?.role, "user");
	const img = (userMsg?.content as Array<{ type: string; data?: string }>).find(
		(c) => c.type === "image",
	);
	assert.ok(img);
	assert.equal(img?.data, Buffer.from("png-bytes").toString("base64"));
});

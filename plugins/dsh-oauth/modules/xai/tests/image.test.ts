import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateOptions } from "@deepseek-ai/dsh-llm";
import { toPiContext } from "../src/context.js";

const imageOptions: GenerateOptions = {
	provider: "xai-oauth",
	model: "grok-4.6",
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

test("toPiContext: 无 attachments 时包含图片抛出 UNSUPPORTED_CONTENT", () => {
	assert.throws(
		() => toPiContext(imageOptions),
		(err: unknown) => (err as { code?: string })?.code === "UNSUPPORTED_CONTENT",
	);
});

test("toPiContext: 有 attachments 时把图片转成 PiMessage ImageContent", async () => {
	const piCtx = await toPiContext(imageOptions, {
		attachments: {
			readImage: async () => ({
				data: Buffer.from("png-bytes"),
				mediaType: "image/png",
			}),
		},
	});
	assert.equal(piCtx.messages.length, 1);
	const user = piCtx.messages[0] as {
		role: string;
		content: Array<{ type: string; data?: string; mimeType?: string }>;
	};
	assert.equal(user.role, "user");
	const img = user.content.find((block) => block.type === "image");
	assert.ok(img);
	assert.equal(img?.data, Buffer.from("png-bytes").toString("base64"));
	assert.equal(img?.mimeType, "image/png");
});

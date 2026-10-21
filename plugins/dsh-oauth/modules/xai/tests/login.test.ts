import assert from "node:assert/strict";
import test from "node:test";
import type {
	OAuthCredentials,
	OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";
import { XaiAuth } from "../src/auth.js";

test("beginLogin 的 onPrompt 不能立刻失败，否则粘贴授权码没有入口", async () => {
	let passed: OAuthLoginCallbacks | undefined;
	const oauth = {
		login: async (callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> => {
			passed = callbacks;
			callbacks.onAuth({
				url: "https://auth.x.ai/oauth2/authorize?test=1",
				instructions: "sign in",
			});
			const prompt = callbacks.onPrompt({
				message: "paste",
				placeholder: "url",
			});
			const winner = await Promise.race([
				new Promise<"local">((resolve) => setTimeout(() => resolve("local"), 20)),
				prompt.then(
					() => "prompt" as const,
					() => "prompt-fail" as const,
				),
			]);
			assert.equal(winner, "local");
			return new Promise<OAuthCredentials>(() => {});
		},
		refreshToken: async () => {
			throw new Error("unused");
		},
		getApiKey: () => "unused",
	};
	const auth = new XaiAuth(
		{ logger: { error() {} } } as never,
		() => ({}),
		oauth,
	);
	const attempt = await auth.beginLogin();
	assert.equal(attempt.url, "https://auth.x.ai/oauth2/authorize?test=1");
	assert.equal(typeof passed?.onPrompt, "function");
});

test("submitLoginPaste 把粘贴内容交给 onPrompt", async () => {
	const received = Promise.withResolvers<string>();
	const oauth = {
		login: async (callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> => {
			callbacks.onAuth({ url: "https://auth.x.ai/oauth2/authorize?test=1" });
			received.resolve(await callbacks.onPrompt({ message: "paste" }));
			return new Promise<OAuthCredentials>(() => {});
		},
		refreshToken: async () => {
			throw new Error("unused");
		},
		getApiKey: () => "unused",
	};
	const auth = new XaiAuth(
		{ logger: { error() {} } } as never,
		() => ({}),
		oauth,
	);
	await auth.beginLogin();
	auth.submitLoginPaste("  abc  ");
	assert.equal(await received.promise, "abc");
});

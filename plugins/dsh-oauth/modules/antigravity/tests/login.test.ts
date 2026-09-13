import assert from "node:assert/strict";
import test from "node:test";
import type {
	OAuthCredentials,
	OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";
import { AntigravityAuth } from "../src/auth.js";

test("beginLogin 的 onPrompt 不能立刻失败，否则会关掉 localhost:51121", async () => {
	let passed: OAuthLoginCallbacks | undefined;
	const oauth = {
		login: async (callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> => {
			passed = callbacks;
			callbacks.onAuth({
				url: "https://accounts.google.com/o/oauth2/v2/auth?test=1",
				instructions: "sign in",
			});
			const prompt = callbacks.onPrompt?.({
				message: "paste",
				placeholder: "url",
			});
			assert.ok(prompt);
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
	const auth = new AntigravityAuth(
		{ logger: { error() {} } } as never,
		() => ({}),
		oauth,
	);
	const attempt = await auth.beginLogin();
	assert.equal(
		attempt.url,
		"https://accounts.google.com/o/oauth2/v2/auth?test=1",
	);
	assert.equal(typeof passed?.onPrompt, "function");
});

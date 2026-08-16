import assert from "node:assert/strict";
import test from "node:test";
import {
	addModelUsage,
	loadUsage,
	tokenTotal,
	visibleModels,
} from "../src/usage-today.js";

test("跨日清零，零用量不入账", () => {
	const next = addModelUsage(
		{ date: "2026-08-15", models: { old: 9 } },
		"gemini-3.7-flash",
		12,
		"2026-08-16",
	);
	assert.deepEqual(next, {
		date: "2026-08-16",
		models: { "gemini-3.7-flash": 12 },
	});
	assert.deepEqual(
		addModelUsage(next, "gemini-3.7-flash", 0, "2026-08-16").models,
		next.models,
	);
});

test("只显示大于 0 的模型，按用量降序", () => {
	assert.deepEqual(
		visibleModels({
			date: "2026-08-16",
			models: { grok: 3, flash: 10, empty: 0 },
		}),
		[
			["flash", 10],
			["grok", 3],
		],
	);
});

test("过期或坏 JSON 当成今天空账", () => {
	assert.deepEqual(
		loadUsage('{"date":"2026-08-15","models":{"a":1}}', "2026-08-16"),
		{
			date: "2026-08-16",
			models: {},
		},
	);
	assert.deepEqual(loadUsage("nope", "2026-08-16"), {
		date: "2026-08-16",
		models: {},
	});
});

test("token 合计包含缓存和推理", () => {
	assert.equal(
		tokenTotal({
			inputTokens: 1,
			outputTokens: 2,
			cacheReadTokens: 3,
			reasoningTokens: 4,
		}),
		10,
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import { decodeApiBody } from "../modules/api-fetch.js";

test("Safari 非 JSON 401 给出原文而不是 pattern 错误", () => {
	assert.throws(
		() => decodeApiBody("unauthorized", 401),
		(error: unknown) =>
			error instanceof Error && error.message === "unauthorized",
	);
});

test("JSON 错误体原样返回", () => {
	assert.deepEqual(decodeApiBody('{"accounts":[]}', 200), { accounts: [] });
});

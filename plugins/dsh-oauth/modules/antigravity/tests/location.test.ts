import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error pi-antigravity is typescript source
import { friendlyAntigravityError } from "pi-antigravity/src/stream/stream.ts";

test("地理位置限制 400 不再误导重新登录", () => {
	const message = friendlyAntigravityError(
		400,
		"User location is not supported for the API use.",
	);
	assert.match(message, /location is not supported/i);
	assert.match(message, /Do not re-login/);
	assert.doesNotMatch(message, /run \/login antigravity/);
});

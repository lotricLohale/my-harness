import assert from "node:assert/strict";
import test from "node:test";

test("safeError 会带上 cause 链", async () => {
	const specifier = "pi-antigravity/src/utils/security.ts";
	const { safeError } = (await import(specifier)) as {
		safeError: (error: unknown) => string;
	};
	const err = new Error("fetch failed", {
		cause: Object.assign(new Error("other side closed"), {
			code: "UND_ERR_SOCKET",
		}),
	});
	const message = safeError(err);
	assert.match(message, /fetch failed/);
	assert.match(message, /UND_ERR_SOCKET/);
	assert.match(message, /other side closed/);
});

test("地理位置限制 400 不再误导重新登录", async () => {
	const specifier = "pi-antigravity/src/stream/stream.ts";
	const { friendlyAntigravityError } = (await import(specifier)) as {
		friendlyAntigravityError: (
			status: number | undefined,
			text: string,
		) => string;
	};
	const message = friendlyAntigravityError(
		400,
		"User location is not supported for the API use.",
	);
	assert.match(message, /location is not supported/i);
	assert.match(message, /Do not re-login/);
	assert.doesNotMatch(message, /run \/login antigravity/);
});

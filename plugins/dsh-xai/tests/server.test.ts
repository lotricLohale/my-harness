import assert from "node:assert/strict";
import test from "node:test";
import { assertSameOriginJson, serializeQuotaGroups } from "../src/index.js";

test("POST 防护拒绝非 JSON 和跨站请求", () => {
	assert.equal(
		assertSameOriginJson({ headers: { "content-type": "text/plain" } }),
		"content-type must be application/json",
	);
	assert.equal(
		assertSameOriginJson({
			headers: {
				"content-type": "application/json",
				"sec-fetch-site": "cross-site",
			},
		}),
		"cross-site requests are not allowed",
	);
	assert.equal(
		assertSameOriginJson({
			headers: {
				"content-type": "application/json",
				origin: "https://evil.example",
				host: "127.0.0.1:3000",
			},
		}),
		"cross-origin requests are not allowed",
	);
	assert.equal(
		assertSameOriginJson({
			headers: {
				"content-type": "application/json",
				origin: "http://127.0.0.1:3000",
				host: "127.0.0.1:3000",
			},
		}),
		undefined,
	);
});

test("quota 序列化只输出浏览器需要字段", () => {
	const serialized = serializeQuotaGroups({
		subscriptionTier: "SuperGrok",
		creditUsagePercent: 25,
		monthlyLimitCents: 3000,
		usedCents: 750,
		currentPeriod: { end: "2026-09-01T00:00:00Z" },
	});
	assert.equal(serialized.length, 1);
	assert.equal(serialized[0]?.displayName, "包含额度");
	assert.equal(JSON.stringify(serialized).includes("access"), false);
	assert.equal(JSON.stringify(serialized).includes("refresh"), false);
});

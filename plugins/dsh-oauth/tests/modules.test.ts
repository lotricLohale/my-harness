import assert from "node:assert/strict";
import test from "node:test";
import {
	enabledModules,
	OAUTH_MODULE_IDS,
	OAUTH_MODULES,
} from "../src/modules.js";

test("默认启用全部 OAuth 模块", () => {
	assert.deepEqual(OAUTH_MODULE_IDS, ["antigravity", "xai"]);
	assert.deepEqual(
		enabledModules(undefined).map((module) => module.id),
		["antigravity", "xai"],
	);
	assert.deepEqual(
		enabledModules([]).map((module) => module.id),
		["antigravity", "xai"],
	);
});

test("可以按模块开关启用子集", () => {
	assert.deepEqual(
		enabledModules(["xai"]).map((module) => module.id),
		["xai"],
	);
	assert.deepEqual(
		enabledModules(["unknown"]).map((module) => module.id),
		[],
	);
});

test("模块表保留后续扩展槽", () => {
	assert.equal(
		OAUTH_MODULES.every((module) => typeof module.apply === "function"),
		true,
	);
	assert.deepEqual(
		OAUTH_MODULES.map((module) => module.label),
		["Antigravity (OAuth)", "xAI (OAuth)"],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	filterSkillBodyForMode,
	getPonytailInstructions,
	isDeactivationCommand,
	parseMode,
	parsePonytailCommand,
} from "../src/index.js";

test("parseMode 只接受四个档位", () => {
	assert.equal(parseMode("full"), "full");
	assert.equal(parseMode(" ULTRA "), "ultra");
	assert.equal(parseMode("review"), undefined);
});

test("空 /ponytail 是查状态", () => {
	assert.deepEqual(parsePonytailCommand(""), { type: "status" });
	assert.deepEqual(parsePonytailCommand("lite"), {
		type: "set-mode",
		mode: "lite",
	});
	assert.equal(parsePonytailCommand("review").type, "invalid");
});

test("整句才能关闭", () => {
	assert.equal(isDeactivationCommand("stop ponytail"), true);
	assert.equal(isDeactivationCommand("add a normal mode toggle"), false);
});

test("强度表只保留当前档", () => {
	const body = [
		"| **lite** | ask |",
		"| **full** | ladder |",
		'- lite: "ask first"',
		'- full: "one line"',
		"- No unrequested abstractions.",
	].join("\n");
	const filtered = filterSkillBodyForMode(body, "full");
	assert.match(filtered, /\*\*full\*\*/);
	assert.doesNotMatch(filtered, /\*\*lite\*\*/);
	assert.match(filtered, /No unrequested abstractions/);
});

test("能读到 ponytail.md", () => {
	assert.match(getPonytailInstructions("full"), /PONYTAIL MODE ACTIVE/);
	assert.match(getPonytailInstructions("full"), /The ladder/);
	assert.equal(getPonytailInstructions("off"), "");
});

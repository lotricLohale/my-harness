import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPercent, shouldPollAfterLogin } from "../src/index.js";
import {
	AccountCard,
	AntigravityAccountsPanel,
} from "../src/client/AntigravitySection.js";

test("client section 渲染账号操作入口", () => {
	const html = renderToStaticMarkup(createElement(AntigravityAccountsPanel));
	assert.match(html, /Antigravity \(OAuth\)/);
	assert.match(html, /添加账号/);
	assert.match(html, /刷新用量/);
	const card = renderToStaticMarkup(
		createElement(AccountCard, {
			account: { id: "a", enabled: true, priority: 0, configured: true },
			onDelete() {},
			deleting: false,
		}),
	);
	assert.match(card, /删除账号/);
});

test("client 百分比和登录轮询状态保持有限", () => {
	assert.equal(formatPercent(0.456), "45.6%");
	assert.equal(formatPercent(undefined), "未知");
	assert.equal(shouldPollAfterLogin("waiting"), true);
	assert.equal(shouldPollAfterLogin("done"), false);
	assert.equal(shouldPollAfterLogin("error"), false);
});

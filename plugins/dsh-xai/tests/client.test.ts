import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	formatCents,
	formatPercent,
	shouldPollAfterLogin,
} from "../src/index.js";
import { AccountCard, XaiAccountsPanel } from "../src/client/XaiSection.js";
import { OAuthModelsSection } from "../src/client/OAuthModelsSection.js";

test("client section 渲染账号操作入口", () => {
	const html = renderToStaticMarkup(
		createElement(OAuthModelsSection, {
			model: "xai",
			children: createElement(XaiAccountsPanel),
		}),
	);
	assert.match(html, /模型（OAuth）/);
	assert.match(html, /xAI \(OAuth\)/);
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

test("client 格式化和登录轮询状态保持有限", () => {
	assert.equal(formatPercent(0.456), "45.6%");
	assert.equal(formatPercent(undefined), "未知");
	assert.equal(formatCents(1234), "$12.34");
	assert.equal(formatCents(undefined), "未知");
	assert.equal(shouldPollAfterLogin("waiting"), true);
	assert.equal(shouldPollAfterLogin("done"), false);
	assert.equal(shouldPollAfterLogin("error"), false);
});

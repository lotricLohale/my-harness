import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OAuthModelsSection } from "../src/client/OAuthModelsSection.js";

test("统一设置页用按钮切换模型授权", () => {
	const html = renderToStaticMarkup(createElement(OAuthModelsSection));
	assert.match(html, /模型（OAuth）/);
	assert.match(html, /Antigravity \(OAuth\)/);
	assert.match(html, /xAI \(OAuth\)/);
	assert.match(html, /role="tablist"/);
	assert.match(html, /aria-selected="true"/);
	assert.match(html, /添加账号/);
	assert.doesNotMatch(html, /<select/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAuthorizeUrl,
	credentialsFromTokenPayload,
	decodeJwtPayload,
	extractIdentityFromIdToken,
	pkcePair,
	XAI_OAUTH_CLIENT_ID,
	XAI_OAUTH_TOKEN_URL,
} from "../src/oauth.js";

test("pkcePair 生成有效的 base64url verifier 和 challenge", () => {
	const { verifier, challenge } = pkcePair();
	assert.equal(typeof verifier, "string");
	assert.equal(typeof challenge, "string");
	assert.equal(verifier.length > 20, true);
	assert.equal(challenge.length > 20, true);
});

test("buildAuthorizeUrl 包含正确的 client_id 和 PKCE 参数", () => {
	const url = buildAuthorizeUrl(
		"http://127.0.0.1:56121/callback",
		"test_challenge",
		"test_state",
		"test_nonce",
	);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		assert.fail("invalid authorize url");
	}
	assert.equal(parsed.searchParams.get("client_id"), XAI_OAUTH_CLIENT_ID);
	assert.equal(parsed.searchParams.get("code_challenge"), "test_challenge");
	assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
	assert.equal(parsed.searchParams.get("state"), "test_state");
	assert.equal(parsed.searchParams.get("nonce"), "test_nonce");
});

test("decodeJwtPayload 正确解析 JWT Payload", () => {
	const payloadObj = {
		email: "user@example.com",
		sub: "user_123",
		preferred_username: "grok_user",
	};
	const fakeJwt = `header.${Buffer.from(JSON.stringify(payloadObj)).toString("base64url")}.signature`;
	const decoded = decodeJwtPayload(fakeJwt);
	assert.deepEqual(decoded, payloadObj);
});

test("extractIdentityFromIdToken 提取 email 和 username", () => {
	const payloadObj = { email: "grok@x.ai", preferred_username: "grok_master" };
	const fakeJwt = `header.${Buffer.from(JSON.stringify(payloadObj)).toString("base64url")}.sig`;
	const identity = extractIdentityFromIdToken(fakeJwt);
	assert.equal(identity.email, "grok@x.ai");
	assert.equal(identity.username, "grok_master");
});

test("credentialsFromTokenPayload 转换 token 响应并计算过期时间", () => {
	const payloadObj = { email: "test@x.ai" };
	const idToken = `h.${Buffer.from(JSON.stringify(payloadObj)).toString("base64url")}.s`;
	const creds = credentialsFromTokenPayload(
		{
			access_token: "acc_123",
			refresh_token: "ref_456",
			id_token: idToken,
			expires_in: 3600,
		},
		XAI_OAUTH_TOKEN_URL,
	);
	assert.equal(creds.access, "acc_123");
	assert.equal(creds.refresh, "ref_456");
	assert.equal(creds.idToken, idToken);
	assert.equal(creds["email"], "test@x.ai");
	assert.equal(typeof creds.expires, "number");
	assert.equal(creds.expires > Date.now(), true);
});

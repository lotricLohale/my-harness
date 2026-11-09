import assert from "node:assert/strict";
import test from "node:test";
import {
	parseLegacyOauthAccounts,
	withLegacyOauthAccounts,
} from "../src/legacy-accounts.js";

const SAMPLE = `llm-antigravity:
  accounts:
    - id: one_example_com_aaaa
      email: one@example.com
      credentialRef: ANTIGRAVITY_OAUTH_ONE
      enabled: true
      priority: 1
    - id: two_example_com_bbbb
      email: two@example.com
      credentialRef: ANTIGRAVITY_OAUTH_TWO
      enabled: true
      priority: 2
llm-xai:
  accounts:
    - id: one_example_com_aaaa
      email: one@example.com
      username: user-1
      credentialRef: XAI_OAUTH_ONE
      enabled: true
      priority: 0
llm-pi-ai:
  providers: {}
`;

test("parseLegacyOauthAccounts 读出 antigravity 和 xai 账号池", () => {
	const parsed = parseLegacyOauthAccounts(SAMPLE);
	assert.equal(parsed.antigravity.length, 2);
	assert.equal(parsed.xai.length, 1);
	assert.equal(parsed.antigravity[0]?.credentialRef, "ANTIGRAVITY_OAUTH_ONE");
	assert.equal(parsed.xai[0]?.username, "user-1");
});

test("中间夹着其他 section 仍能读完 antigravity 账号", () => {
	const text = `llm-antigravity:
  accounts:
    - id: one_example_com_aaaa
      email: one@example.com
      credentialRef: ANTIGRAVITY_OAUTH_ONE
      enabled: true
      priority: 1
    - id: two_example_com_bbbb
      email: two@example.com
      credentialRef: ANTIGRAVITY_OAUTH_TWO
      enabled: true
      priority: 2
    - id: three_example_com_cccc
      email: three@example.com
      credentialRef: ANTIGRAVITY_OAUTH_THREE
      enabled: true
      priority: 3
agent-default-model:
  model: skip
llm-xai:
  accounts:
    - id: one_example_com_aaaa
      email: one@example.com
      credentialRef: XAI_OAUTH_ONE
      enabled: true
      priority: 0
`;
	const parsed = parseLegacyOauthAccounts(text);
	assert.equal(parsed.antigravity.length, 3);
	assert.equal(parsed.xai.length, 1);
});

test("withLegacyOauthAccounts 只在空池时迁入", () => {
	const migrated = withLegacyOauthAccounts(
		{ antigravity: { accounts: [] }, xai: { accounts: [] } },
		parseLegacyOauthAccounts(SAMPLE),
	);
	assert.equal(migrated.migrated, true);
	assert.equal((migrated.antigravity as { accounts: unknown[] }).accounts.length, 2);
	const kept = withLegacyOauthAccounts(
		{
			antigravity: { accounts: [{ id: "keep", credentialRef: "KEEP" }] },
			xai: { accounts: [] },
		},
		parseLegacyOauthAccounts(SAMPLE),
	);
	assert.equal(
		(kept.antigravity as { accounts: Array<{ id: string }> }).accounts[0]?.id,
		"keep",
	);
	assert.equal((kept.xai as { accounts: unknown[] }).accounts.length, 1);
});

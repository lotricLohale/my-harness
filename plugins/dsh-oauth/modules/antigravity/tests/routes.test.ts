import assert from "node:assert/strict";
import test from "node:test";
import { registerWebRoutes } from "../src/server.js";

test("registerWebRoutes 把账号 GET 挂到 connection.fetch", () => {
	const registered: Array<{ path: string; methods: readonly string[] }> = [];
	const ctx = {
		effect(run: () => unknown) {
			return run();
		},
		connection: {
			fetch: {
				register(route: { path: string; methods: readonly string[] }) {
					registered.push(route);
					return async () => undefined;
				},
			},
		},
	};
	registerWebRoutes(
		ctx as never,
		{
			accountPayloads: async () => [],
			loginPending: () => false,
		} as never,
	);
	assert.ok(
		registered.some(
			(route) =>
				route.path === "/api/antigravity/accounts" &&
				route.methods.includes("GET"),
		),
	);
});

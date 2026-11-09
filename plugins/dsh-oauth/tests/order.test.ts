import assert from "node:assert/strict";
import test from "node:test";
import { consumptionOrder, withConsumptionOrder } from "../modules/order.js";

test("withConsumptionOrder 让列表第一项先消耗", () => {
	const next = withConsumptionOrder(
		[
			{ id: "a", priority: 0 },
			{ id: "b", priority: 0 },
			{ id: "c", priority: 0 },
		],
		["c", "a", "b"],
	);
	assert.deepEqual(
		consumptionOrder(next).map((account) => account.id),
		["c", "a", "b"],
	);
});

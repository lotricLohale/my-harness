import assert from "node:assert/strict";
import test from "node:test";
import {
	formatCents,
	formatPercent,
	serializeQuotaGroups,
} from "../src/web-data.js";

test("formatCents 正确格式化美分到美元", () => {
	assert.equal(formatCents(undefined), "未知");
	assert.equal(formatCents(0), "$0.00");
	assert.equal(formatCents(450), "$4.50");
	assert.equal(formatCents(3000), "$30.00");
});

test("formatPercent 正确格式化百分比", () => {
	assert.equal(formatPercent(undefined), "未知");
	assert.equal(formatPercent(0.5), "50%");
	assert.equal(formatPercent(0.152), "15.2%");
});

test("serializeQuotaGroups 将 snapshot 转换成前端可视化的 group 结构", () => {
	const groups = serializeQuotaGroups({
		subscriptionTier: "SuperGrok",
		creditUsagePercent: 20,
		monthlyLimitCents: 3000,
		usedCents: 600,
		onDemandEnabled: true,
		onDemandCapCents: 5000,
		onDemandUsedCents: 1000,
		prepaidBalanceCents: 500,
		currentPeriod: {
			start: "2026-08-01T00:00:00Z",
			end: "2026-09-01T00:00:00Z",
		},
	});

	assert.equal(groups.length, 2);
	assert.equal(groups[0]?.displayName, "包含额度");
	assert.equal(groups[1]?.displayName, "按需与余额");
	assert.equal(
		groups[0]?.buckets.some(
			(b) => b.displayName === "订阅等级" && b.detail === "SuperGrok",
		),
		true,
	);
	assert.equal(
		groups[0]?.buckets.some(
			(b) => b.displayName === "额度剩余" && b.remainingFraction === 0.8,
		),
		true,
	);
	assert.equal(
		groups[1]?.buckets.some(
			(b) => b.displayName === "按需计费" && b.detail === "已开启",
		),
		true,
	);
	assert.equal(
		groups[1]?.buckets.some(
			(b) => b.displayName === "预付余额" && b.detail === "$5.00",
		),
		true,
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCashEvents, amountFromCents, cairoDayKey,
  cairoRangeDayKeys, cairoStartOfDay, decimalEgpToCents,
} from "./cash-reporting";

test("amounts are calculated from decimal cents without float accumulation", () => {
  assert.equal(decimalEgpToCents("0.29"), 29);
  assert.equal(decimalEgpToCents("1020.05"), 102005);
  assert.equal(decimalEgpToCents("40"), 4000);
  assert.equal(amountFromCents(29), 0.29);
  for (const value of ["-1", "1.001", "hi", "1e3", ""]) {
    assert.throws(() => decimalEgpToCents(value));
  }
});

test("pending/cancelled orders never produce revenue unless there is a capture event", () => {
  assert.deepEqual(aggregateCashEvents([]).netCents, 0);
  const report = aggregateCashEvents([
    { kind: "CAPTURE", amountCents: 50000, at: new Date("2026-10-19T21:30:00Z") },
    { kind: "REFUND", amountCents: 12000, at: new Date("2026-10-20T10:00:00Z") },
    { kind: "REFUND", amountCents: 8000, at: new Date("2026-10-20T11:00:00Z") },
  ]);
  assert.equal(report.grossCents, 50000);
  assert.equal(report.refundedCents, 20000);
  assert.equal(report.netCents, 30000);
  assert.equal(report.paidOrders, 1);
  assert.equal(report.daily.get("2026-10-20")?.paidOrders, 1);
});

test("refund of an old order can make today's net negative", () => {
  const row = aggregateCashEvents([
    { kind: "REFUND", amountCents: 7500, at: new Date("2026-10-20T09:00:00Z") },
  ]);
  assert.equal(row.netCents, -7500);
  assert.equal(row.paidOrders, 0);
});

test("today/7d ranges use Cairo calendar days, not arbitrary rolling hours", () => {
  const now = new Date("2026-10-20T22:30:00Z");
  assert.equal(cairoDayKey(now), "2026-10-21");
  assert.deepEqual(cairoRangeDayKeys("today", now), ["2026-10-21"]);
  assert.equal(cairoRangeDayKeys("7d", now)[0], "2026-10-15");
  assert.equal(cairoRangeDayKeys("30d", now).length, 30);
  const start = cairoStartOfDay("2026-10-21");
  assert.equal(cairoDayKey(start), "2026-10-21");
  assert.notEqual(cairoDayKey(new Date(start.getTime() - 1000)), "2026-10-21");
});

test("refunds are aggregated separately even when gross capture is zero in range", () => {
  const report = aggregateCashEvents([
    { kind: "REFUND", amountCents: 2355, at: new Date("2026-10-10T09:00:00Z") },
  ]);
  assert.equal(report.grossCents, 0);
  assert.equal(report.refundedCents, 2355);
  assert.equal(report.netCents, -2355);
});

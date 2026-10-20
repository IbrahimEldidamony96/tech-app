import assert from "node:assert/strict";
import test from "node:test";
import { expiryMinutesFromEnv, isExpiredUnpaidOnlineOrder } from "./order-expiry";
const cutoff = new Date("2026-10-20T16:00:00Z");
const eligible = {
  status: "PENDING", paymentStatus: "PENDING",
  createdAt: new Date("2026-10-20T14:00:00Z"),
  payment: { status: "PENDING", method: "CARD" },
};

test("only expired unpaid online orders are eligible", () => {
  assert.equal(isExpiredUnpaidOnlineOrder(eligible, cutoff), true);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, payment: {status:"PENDING",method:"WALLET"}}, cutoff), true);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, payment: {status:"PENDING",method:"CASH_ON_DELIVERY"}}, cutoff), false);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, payment: {status:"PAID",method:"CARD"}}, cutoff), false);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, paymentStatus:"PAID"}, cutoff), false);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, status:"CONFIRMED"}, cutoff), false);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, createdAt:cutoff}, cutoff), false);
  assert.equal(isExpiredUnpaidOnlineOrder({...eligible, payment:null}, cutoff), false);
});

test("reject invalid expiration settings instead of accidentally disabling expiry", () => {
  assert.equal(expiryMinutesFromEnv(undefined), 60);
  assert.equal(expiryMinutesFromEnv("90"), 90);
  for (const bad of ["-2","0","1.5","nan","Infinity","1441","abc"]) {
    assert.throws(() => expiryMinutesFromEnv(bad));
  }
});

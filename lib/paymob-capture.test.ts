import assert from "node:assert/strict";
import test from "node:test";
import { verifiedPaymobCapture } from "./paymob";

const callback = { id: 123, order: { id: 456, merchant_order_id: "local-order" }, amount_cents: 10000, currency: "EGP", integration_id: 7 };
const remote = { ...callback, success: true, pending: false, is_auth: false, is_capture: false, is_refunded: false, is_voided: false };
test("capture binding uses authenticated provider state", () => {
  assert.equal(verifiedPaymobCapture(callback, remote).orderId, "local-order");
  assert.throws(() => verifiedPaymobCapture({ ...callback, order: { ...callback.order, merchant_order_id: "another-order" } }, remote));
  assert.throws(() => verifiedPaymobCapture(callback, { ...remote, order: { ...remote.order, id: 999 } }));
  assert.throws(() => verifiedPaymobCapture(callback, { ...remote, id: 999 }));
  assert.throws(() => verifiedPaymobCapture(callback, { ...remote, integration_id: 8 }));
});
test("authorizations, pending, failed, refunded and mismatched amounts cannot fulfill orders", () => {
  for (const change of [{ is_auth: true }, { pending: true }, { success: false }, { is_refunded: true }, { is_voided: true }, { amount_cents: 1 }, { currency: "USD" }]) {
    assert.throws(() => verifiedPaymobCapture(callback, { ...remote, ...change }));
  }
});

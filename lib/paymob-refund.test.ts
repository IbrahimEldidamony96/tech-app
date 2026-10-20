import assert from "node:assert/strict";
import test from "node:test";
import { PaymobApiError, validatePaymobRefundInquiry } from "./paymob";

const expected = { transactionId: "111222", orderId: "tech-order", amountCents: 12000 };
const payload = {
  id: 111222,
  order: { merchant_order_id: "tech-order" },
  currency: "EGP",
  amount_cents: 12000,
  success: true,
  refunded_amount_cents_int: 2500,
};

test("verified Paymob inquiry extracts cumulative refunded amount", () => {
  const result = validatePaymobRefundInquiry(payload, expected);
  assert.equal(result.refundedAmountCents, 2500);
});
test("reconciliation never trusts a different Paymob payment or order", () => {
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, id: 111223 }, expected), PaymobApiError);
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, order: { merchant_order_id: "foreign" } }, expected), PaymobApiError);
});
test("reconciliation refuses wrong currency, original amount or failed payment", () => {
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, currency: "USD" }, expected), PaymobApiError);
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, amount_cents: 1 }, expected), PaymobApiError);
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, success: false }, expected), PaymobApiError);
});
test("reconciliation rejects nonsensical refund totals", () => {
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, refunded_amount_cents_int: 12001 }, expected), PaymobApiError);
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, refunded_amount_cents_int: -1 }, expected), PaymobApiError);
  assert.throws(() => validatePaymobRefundInquiry({ ...payload, refunded_amount_cents_int: "5.5" }, expected), PaymobApiError);
});

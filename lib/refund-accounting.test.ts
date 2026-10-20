import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/app/generated/prisma/client";
import { maximumReturnRefund, paymentStatusAfterRefund, proratedPoints, refundBalance } from "./refund-accounting";
const d = (v: string) => new Prisma.Decimal(v);

test("refund caps to returned net merchandise not full cart or shipping", () => {
  const max = maximumReturnRefund(
    { subtotal: d("1100"), discount: d("100"), total: d("1050") },
    [{ quantity: 1, orderItem: { quantity: 1, totalPrice: d("100") } }],
  );
  assert.equal(max.toFixed(2), "90.90");
});

test("multiple items have a collective cap and do not refund shipping", () => {
  const max = maximumReturnRefund(
    { subtotal: d("200"), discount: d("50"), total: d("170") },
    [{ quantity: 2, orderItem: { quantity: 2, totalPrice: d("200") } }],
  );
  assert.equal(max.toFixed(2), "150.00");
});
test("invalid quantities never have a refund allowance", () => {
  assert.equal(maximumReturnRefund(
    { subtotal: d("50"), discount: d("0"), total: d("50") },
    [{ quantity: 4, orderItem: { quantity: 2, totalPrice: d("50") } }],
  ).toFixed(2), "0.00");
});
test("reserve pending and confirmed refunds before allowing a new one", () => {
  assert.equal(refundBalance(d("100"), d("60"), d("30")).toFixed(2), "10.00");
});
test("partial refund never marks full original payment as refunded", () => {
  assert.equal(paymentStatusAfterRefund(d("100"), d("25")), "PARTIALLY_REFUNDED");
  assert.equal(paymentStatusAfterRefund(d("100"), d("100")), "REFUNDED");
  assert.equal(paymentStatusAfterRefund(d("100"), d("0")), "PAID");
});
test("prorated loyalty differences converge exactly at full compensation", () => {
  assert.equal(proratedPoints(7, d("49"), d("100")), 3);
  assert.equal(proratedPoints(7, d("100"), d("100")), 7);
});

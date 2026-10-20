import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/app/generated/prisma/client";
import { calculateBundleDiscount } from "./bundle-discount";

const money = (value: string | number) => new Prisma.Decimal(value);
const line = (productId: string, quantity: number, total: string) => ({
  productId, quantity, lineTotal: money(total),
});
const offer = (
  type: "PERCENTAGE" | "FIXED",
  amount: string,
  items: { productId: string; quantity: number }[],
) => ({ discountType: type, discountValue: money(amount), items });

test("bundle percentage never discounts expensive unrelated items", () => {
  const value = calculateBundleDiscount(
    offer("PERCENTAGE", "10", [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }]),
    [line("a", 1, "10"), line("b", 1, "20"), line("unrelated", 1, "10000")],
  );
  assert.equal(value.toFixed(2), "3.00");
});

test("fixed bundle discount cannot exceed required product subtotal", () => {
  const value = calculateBundleDiscount(
    offer("FIXED", "500", [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }]),
    [line("a", 1, "10"), line("b", 1, "20"), line("unrelated", 1, "10000")],
  );
  assert.equal(value.toFixed(2), "30.00");
});

test("missing bundle quantities are ineligible", () => {
  const value = calculateBundleDiscount(
    offer("PERCENTAGE", "10", [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }]),
    [line("a", 1, "10"), line("b", 1, "20")],
  );
  assert.equal(value.toFixed(2), "0.00");
});

test("bundle uses the required quantities just once, not multiplied sets", () => {
  const value = calculateBundleDiscount(
    offer("PERCENTAGE", "20", [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }]),
    [line("a", 3, "300"), line("b", 2, "100")],
  );
  assert.equal(value.toFixed(2), "30.00");
});

test("multiple variants of one product select cheapest eligible units", () => {
  const value = calculateBundleDiscount(
    offer("PERCENTAGE", "50", [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }]),
    [line("a", 1, "1000"), line("a", 2, "20"), line("b", 1, "50")],
  );
  assert.equal(value.toFixed(2), "35.00");
});

test("fractional percentages round to the nearest piaster", () => {
  const value = calculateBundleDiscount(
    offer("PERCENTAGE", "15", [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }]),
    [line("a", 1, "1.11"), line("b", 1, "2.22")],
  );
  assert.equal(value.toFixed(2), "0.50");
});

test("invalid or empty bundle requirements do not apply", () => {
  assert.equal(calculateBundleDiscount(offer("FIXED", "10", []), [line("a", 1, "100")]).toFixed(2), "0.00");
  assert.equal(calculateBundleDiscount(offer("FIXED", "10", [{ productId: "a", quantity: 0 }]), [line("a", 1, "100")]).toFixed(2), "0.00");
});

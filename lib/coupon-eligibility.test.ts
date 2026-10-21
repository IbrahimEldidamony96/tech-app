import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/app/generated/prisma/client";
import { eligibleCouponSubtotal } from "./coupon-eligibility";

const lines = [
  { categoryId: "phones", brandId: "a", lineTotal: new Prisma.Decimal(100) },
  { categoryId: "laptops", brandId: "a", lineTotal: new Prisma.Decimal(900) },
  { categoryId: "phones", brandId: "b", lineTotal: new Prisma.Decimal(200) },
];
test("coupon scopes intersect instead of replacing one another", () => {
  assert.equal(eligibleCouponSubtotal(lines, { categoryId: "phones", brandId: "a" }).toString(), "100");
  assert.equal(eligibleCouponSubtotal(lines, { categoryId: "phones", brandId: null }).toString(), "300");
  assert.equal(eligibleCouponSubtotal(lines, { categoryId: null, brandId: "a" }).toString(), "1000");
  assert.equal(eligibleCouponSubtotal(lines, { categoryId: "missing", brandId: "a" }).toString(), "0");
});

import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/app/generated/prisma/client";
import { effectiveVariantPrice } from "./product-pricing";

const now = new Date("2026-10-20T12:00:00.000Z");
const price = (s: string) => new Prisma.Decimal(s);
const variant = {
  price: price("100.00"),
  salePrice: price("70.00"),
  saleStartsAt: new Date("2026-10-10T00:00:00.000Z"),
  saleEndsAt: new Date("2026-10-25T00:00:00.000Z"),
};

test("active sale is respected by all price consumers", () => {
  assert.equal(effectiveVariantPrice(variant, now).toFixed(2), "70.00");
});
test("future sale cannot change current totals", () => {
  assert.equal(effectiveVariantPrice({ ...variant, saleStartsAt: new Date("2026-10-21T00:00:00.000Z") }, now).toFixed(2), "100.00");
});
test("expired sale cannot change current totals", () => {
  assert.equal(effectiveVariantPrice({ ...variant, saleEndsAt: new Date("2026-10-19T00:00:00.000Z") }, now).toFixed(2), "100.00");
});
test("a higher advertised sale price is not a discount", () => {
  assert.equal(effectiveVariantPrice({ ...variant, salePrice: price("110.00") }, now).toFixed(2), "100.00");
});

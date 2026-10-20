import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission } from "./permissions";

test("only super-admin can manage staff accounts", () => {
  assert.equal(hasPermission("ADMIN", "staff:manage"), false);
  assert.equal(hasPermission("SUPER_ADMIN", "staff:manage"), true);
  assert.equal(hasPermission("SUPPORT", "staff:manage"), false);
});
test("both admin ranks can moderate reviews", () => {
  assert.equal(hasPermission("ADMIN", "reviews:moderate"), true);
  assert.equal(hasPermission("SUPER_ADMIN", "reviews:moderate"), true);
  assert.equal(hasPermission("SUPPORT", "reviews:moderate"), false);
});
test("unknown and customer roles have no admin rights", () => {
  assert.equal(hasPermission("CUSTOMER", "audit:read"), false);
  assert.equal(hasPermission(undefined, "staff:manage"), false);
});

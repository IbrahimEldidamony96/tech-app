import assert from "node:assert/strict";
import test from "node:test";
import { availablePaymentMethods } from "./payment-configuration";
test("unconfigured or unverifiable online payment methods are unavailable", () => {
  assert.deepEqual(availablePaymentMethods({}), ["CASH_ON_DELIVERY"]);
  const configured = { PAYMOB_SECRET_KEY: "test", PAYMOB_PUBLIC_KEY: "test", PAYMOB_HMAC_SECRET: "test", PAYMOB_API_KEY: "test", PAYMOB_INTEGRATION_ID_CARD: "123" };
  assert.deepEqual(availablePaymentMethods(configured), ["CASH_ON_DELIVERY", "CARD"]);
  assert.deepEqual(availablePaymentMethods({ ...configured, PAYMOB_API_KEY: "" }), ["CASH_ON_DELIVERY"]);
  assert.deepEqual(availablePaymentMethods({ ...configured, PAYMOB_INTEGRATION_ID_CARD: "NaN" }), ["CASH_ON_DELIVERY"]);
});

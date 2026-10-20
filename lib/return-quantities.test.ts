import assert from "node:assert/strict";
import test from "node:test";
import { returnQuantityConflict } from "./return-quantities";

const purchased = [{ id: "itemA", quantity: 2, productName: "Keyboard" }];

test("request cannot reserve quantities already requested by another return", () => {
  const previous = new Map([["itemA", 2]]);
  assert.deepEqual(
    returnQuantityConflict([{ orderItemId: "itemA", quantity: 2 }], purchased, previous),
    { kind: "exceeds_purchased", productName: "Keyboard" },
  );
});

test("a returned quantity below remaining allowance is accepted", () => {
  assert.equal(
    returnQuantityConflict([{ orderItemId: "itemA", quantity: 1 }], purchased, new Map([["itemA", 1]])),
    null,
  );
});

test("a return cannot claim an item from another order", () => {
  assert.deepEqual(
    returnQuantityConflict([{ orderItemId: "foreign", quantity: 1 }], purchased, new Map()),
    { kind: "invalid_item" },
  );
});

test("duplicate lines cannot bypass quantity allowance", () => {
  assert.deepEqual(
    returnQuantityConflict(
      [{ orderItemId: "itemA", quantity: 2 }, { orderItemId: "itemA", quantity: 1 }],
      purchased, new Map(),
    ),
    { kind: "exceeds_purchased", productName: "Keyboard" },
  );
});

test("no extra inventory can be received after the full quantity was restored", () => {
  assert.deepEqual(
    returnQuantityConflict([{ orderItemId: "itemA", quantity: 1 }], purchased, new Map([["itemA", 2]])),
    { kind: "exceeds_purchased", productName: "Keyboard" },
  );
});

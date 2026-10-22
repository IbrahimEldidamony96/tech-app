import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import Module, { createRequire } from "node:module";
import * as React from "react";

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
const originalReact = globalThis.React;
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
let slots = [], cursor = 0, effects = [];
const fakeReact = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useCallback(fn) { return fn; },
  useMemo(fn) { return fn(); },
  useEffect(fn) { effects.push(fn); },
};
const stubs = new Map([
  ["react", fakeReact],
  ["next-intl", { useTranslations: () => key => key, useLocale: () => "en" }],
  ["next/navigation", { useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams("ref=AUDITREF123&next=/account") }],
  ["next-auth/react", { signIn: async () => ({}) }],
  ["next/image", () => null], ["next/link", () => null],
  ["@/components/auth-shell", { AuthShell: () => null }],
]);
Module._load = function(id, ...rest) { return stubs.has(id) ? stubs.get(id) : originalLoad.call(this, id, ...rest); };
globalThis.React = React;
function reset() { slots = []; cursor = 0; effects = []; }
function render(component, props) { cursor = 0; return component(props); }
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}
const button = (tree, label) => nodes(tree).find(node => node.type === "button" && (!label || node.props["aria-label"] === label || node.props.children === label));
afterEach(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; globalThis.localStorage = originalStorage; reset(); });
after(() => { Module._load = originalLoad; globalThis.React = originalReact; });

test("sale-date blur skips unchanged values and converts edited local times", async () => {
  reset();
  const { VariantsManager } = require("../components/admin/variants-manager.tsx");
  const { localDateTime } = require("./local-date-time.ts");
  const variant = { id: "variant", sku: "fixture", price: 100, stock: 2, isActive: true,
    optionSummary: "", salePrice: 90, saleStartsAt: "2026-10-22T09:00:37.000Z", saleEndsAt: "2026-10-29T21:30:00.000Z" };
  const props = { productId: "product", options: [], variants: [variant], setVariants() {}, locale: "en" };
  const calls = [];
  globalThis.fetch = async (_url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ data: variant }) }; };
  const fields = nodes(render(VariantsManager, props)).filter(node => node.props.type === "datetime-local");
  for (const field of fields) field.props.onBlur({ target: { value: field.props.defaultValue } });
  assert.equal(calls.length, 0);
  assert.equal(fields[0].props.defaultValue, localDateTime(variant.saleStartsAt));
  fields[0].props.onBlur({ target: { value: "2026-10-22T13:00" } });
  assert.deepEqual(calls[0], { saleStartsAt: new Date("2026-10-22T13:00").toISOString() });
  await new Promise(resolve => setImmediate(resolve));
});

test("checkout refreshes the balance and resets stale loyalty redemption after a conflict", async () => {
  reset();
  const { CheckoutForm } = require("../components/checkout-form.tsx");
  const props = { items: [], subtotal: 100, loyaltyPoints: 50, paymentMethods: ["CASH_ON_DELIVERY"],
    addresses: [{ id: "address", firstName: "Test", lastName: "User", phone: "01000000000", city: "Cairo", governorate: "Cairo", street: "Fixture", isDefault: true }] };
  let tree = render(CheckoutForm, props);
  nodes(tree).find(node => node.props.type === "number").props.onChange({ target: { value: "10" } });
  tree = render(CheckoutForm, props);
  let submitted;
  globalThis.fetch = async (_url, options) => { submitted = JSON.parse(options.body); return {
    ok: false, json: async () => ({ code: "INSUFFICIENT_LOYALTY_POINTS", loyaltyPoints: 3 }) }; };
  await button(tree, "placeOrder").props.onClick();
  assert.equal(submitted.loyaltyPointsToRedeem, 10);
  tree = render(CheckoutForm, props);
  const field = nodes(tree).find(node => node.props.type === "number");
  assert.equal(field.props.max, 3);
  assert.equal(field.props.value, 0);
  assert.equal(button(tree, "placeOrder").props.disabled, false);
  assert.ok(nodes(tree).some(node => node.props.role === "alert" && node.props.children === "errors.insufficientLoyaltyPoints"));
});

test("registration submits the referral from its URL", async () => {
  reset();
  const page = require("../app/register/page.tsx").default();
  const component = page.props.children.type;
  let tree = render(component);
  for (const [id, value] of [["register-name", "Customer"], ["register-email", "test@example.invalid"], ["register-password", "FixturePassword1"]]) {
    nodes(tree).find(node => node.props.id === id).props.onChange({ target: { value } });
  }
  tree = render(component);
  let payload;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; };
  await nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payload.referralCode, "AUDITREF123");
});

test("a rejected payment fetch shows an error and releases the retry button", async () => {
  reset();
  const { CompletePaymentButton } = require("../components/complete-payment-button.tsx");
  globalThis.fetch = async () => { throw new TypeError("Offline"); };
  await button(render(CompletePaymentButton, { orderId: "fixture" })).props.onClick();
  const tree = render(CompletePaymentButton, { orderId: "fixture" });
  assert.equal(button(tree).props.disabled, false);
  assert.ok(nodes(tree).some(node => node.type === "p" && String(node.props.children).includes("connection")));
});

test("failed cart updates preserve quantity, prevent overlap and permit retry", async () => {
  reset();
  const { CartItems } = require("../components/cart-items.tsx");
  const props = { initialItems: [{ id: "line", quantity: 1, variant: { id: "variant", sku: "sku", price: 100, stock: 5, isActive: true, optionSummary: "", product: { id: "product", name: "Phone", slug: "phone", isActive: true, images: [] } } }] };
  let finish, calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = button(render(CartItems, props), "increaseQuantity").props.onClick();
  const tree = render(CartItems, props);
  assert.equal(button(tree, "increaseQuantity").props.disabled, true);
  await button(tree, "increaseQuantity").props.onClick();
  assert.equal(calls, 1);
  finish({ ok: false });
  await pending;
  const failed = render(CartItems, props);
  assert.equal(slots[0][0].quantity, 1);
  assert.equal(button(failed, "increaseQuantity").props.disabled, false);
  assert.ok(nodes(failed).some(node => node.props.role === "alert"));
  globalThis.fetch = async () => ({ ok: true });
  await button(failed, "increaseQuantity").props.onClick();
  assert.equal(slots[0][0].quantity, 2);
});

test("wishlist removal keeps the item on failure and retries an idempotent delete", async () => {
  reset();
  const { WishlistItems } = require("../components/wishlist-items.tsx");
  const props = { initialItems: [{ id: "item", product: { id: "product", name: "Phone", slug: "phone", isActive: true, image: null, price: 100, stock: 1 } }] };
  globalThis.fetch = async () => { throw new TypeError("Offline"); };
  await button(render(WishlistItems, props), "removeItem").props.onClick();
  assert.equal(slots[0].length, 1);
  let method;
  globalThis.fetch = async (_url, options) => { method = options.method; return { ok: true }; };
  await button(render(WishlistItems, props), "removeItem").props.onClick();
  assert.equal(method, "DELETE");
  assert.equal(slots[0].length, 0);
});

test("guest cart request failures leave a visible retry control", async () => {
  reset();
  const { GuestCart } = require("../components/guest-cart.tsx");
  globalThis.localStorage = { getItem: () => JSON.stringify([{ variantId: "variant", quantity: 1 }]) };
  globalThis.fetch = async () => { throw new TypeError("Offline"); };
  render(GuestCart);
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  const tree = render(GuestCart);
  assert.ok(button(tree, "refreshCart"));
  assert.ok(nodes(tree).some(node => node.props.role === "alert"));
});

test("staff can verify a failed online payment using its provider transaction reference", async () => {
  reset();
  const { OrderActions } = require("../components/admin/order-actions.tsx");
  const props = { orderId: "order", orderStatus: "PENDING", paymentMethod: "CARD", paymentStatus: "FAILED", shipmentStatus: null };
  let tree = render(OrderActions, props);
  assert.equal(button(tree, "verifyPayment").props.disabled, true);
  nodes(tree).find(node => node.type === "input" && node.props.inputMode === "numeric").props.onChange({ target: { value: "123" } });
  tree = render(OrderActions, props);
  let payload;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true }; };
  await button(tree, "verifyPayment").props.onClick();
  assert.equal(payload.transactionId, "123");
});

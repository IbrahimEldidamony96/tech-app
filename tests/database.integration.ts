import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { encode } from "next-auth/jwt";
import type { Pool } from "pg";
import { prisma } from "../lib/prisma";
import { getOrCreateCart } from "../lib/cart";
import { getOrCreateWishlist } from "../lib/wishlist";
import { applyBostaWebhookStatus } from "../lib/shipment-service";
import { getProductList } from "../lib/queries/products";
import { getWishlistForUser } from "../lib/queries/wishlist";
import type { Prisma } from "../app/generated/prisma/client";

assert.ok(process.env.TEST_DATABASE_URL, "An isolated test database is required");
assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
const prefix = `regression-${randomUUID()}`;
const transactionBase = Date.now();
const secret = randomUUID();
const providerTransactions = new Map<string, Record<string, unknown>>();
let provider: Server;
let app: ChildProcess | undefined;
let origin = "";
let cookie = "";
let userId = "";
let categoryId = "";
let productId = "";
let variantId = "";
let serverOutput = "";
const orders: string[] = [];
const products: string[] = [];

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

async function request(path: string, method = "GET", body?: unknown, expected = 200) {
  const response = await fetch(`${origin}${path}`, {
    method, headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000), redirect: "manual",
  });
  const result = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}${response.status >= 500 ? `\n${serverOutput.slice(-2000)}` : ""}`);
  return result;
}

async function order(data: Partial<Prisma.OrderUncheckedCreateInput> = {}, paymentData: Partial<Prisma.PaymentUncheckedCreateWithoutOrderInput> = {}) {
  const result = await prisma.order.create({ data: {
    userId, subtotal: 100, total: 100,
    shippingFirstName: "Regression", shippingLastName: "Customer", shippingPhone: "01000000000",
    shippingCountry: "Egypt", shippingGovernorate: "Cairo", shippingCity: "Cairo", shippingStreet: "Test fixture",
    ...data,
    payment: { create: { method: "CASH_ON_DELIVERY", amount: 100, ...paymentData } },
    shipment: { create: {} },
    items: { create: { variantId, quantity: 1, productName: prefix, sku: prefix, unitPrice: 100, totalPrice: 100 } },
  }, include: { items: true, payment: true, shipment: true } });
  orders.push(result.id);
  return result;
}

before(async () => {
  const user = await prisma.user.create({ data: { name: prefix, email: `${prefix}@example.invalid`, role: "ADMIN", emailVerified: new Date() } });
  userId = user.id;
  categoryId = (await prisma.category.create({ data: { nameEn: prefix, nameAr: prefix, slug: prefix } })).id;
  const product = await prisma.product.create({ data: {
    nameEn: prefix, nameAr: prefix, slug: prefix, categoryId,
    variants: { create: { sku: prefix, price: 100, stock: 10 } },
  }, include: { variants: true } });
  productId = product.id;
  products.push(product.id);
  variantId = product.variants[0].id;

  // Every provider request is directed to this local fixture, never a live account.
  provider = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/auth/tokens") return void res.end(JSON.stringify({ token: "test-only-provider-token" }));
    const id = req.url?.match(/^\/api\/acceptance\/transactions\/(\d+)\?token=test-only-provider-token$/)?.[1];
    const transaction = id && providerTransactions.get(id);
    res.statusCode = transaction ? 200 : 404;
    res.end(JSON.stringify(transaction || { error: "Unexpected provider request" }));
  });
  const providerPort = await listen(provider);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env, AUTH_SECRET: secret, AUTH_TRUST_HOST: "true", APP_URL: origin,
    AUTH_URL: origin, NEXTAUTH_URL: origin,
    PAYMOB_BASE_URL: `http://127.0.0.1:${providerPort}`, PAYMOB_SECRET_KEY: "test-only-secret",
    PAYMOB_PUBLIC_KEY: "test-only-public", PAYMOB_HMAC_SECRET: secret, PAYMOB_API_KEY: "test-only-api",
    PAYMOB_INTEGRATION_ID_CARD: "7", PAYMOB_INTEGRATION_ID_WALLET: "8",
    BOSTA_BASE_URL: `http://127.0.0.1:${providerPort}`, BOSTA_API_KEY: "test-only-bosta",
    RESEND_API_KEY: "", NODE_ENV: "production",
  };
  const serverProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  app = serverProcess;
  serverProcess.stdout?.on("data", data => { serverOutput = (serverOutput + data).slice(-12000); });
  serverProcess.stderr?.on("data", data => { serverOutput = (serverOutput + data).slice(-12000); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (serverProcess.exitCode !== null) throw new Error(`Test application stopped: ${serverOutput}`);
    try {
      const response = await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Server is starting. */ }
    await delay(200);
  }
  assert.ok(ready, `Production server did not become ready: ${serverOutput}`);
  const token = await encode({ secret, salt: "authjs.session-token", maxAge: 3600, token: {
    id: userId, sub: userId, name: prefix, email: user.email, role: "ADMIN", sessionVersion: 0,
    authenticatedAt: Date.now(), authProvider: "credentials",
  } });
  cookie = `authjs.session-token=${token}`;
  assert.equal((await request("/api/auth/session")).user.id, userId);
}, { timeout: 60000 });

after(async () => {
  if (app && app.exitCode === null) {
    const stopped = new Promise<void>(resolve => app!.once("exit", () => resolve()));
    app.kill();
    await Promise.race([stopped, delay(5000)]);
  }
  if (provider) await new Promise<void>(resolve => provider.close(() => resolve()));
  try {
    // Cleanup is restricted to exact IDs created by this suite.
    await prisma.refund.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.inventoryMovement.deleteMany({ where: { variant: { productId: { in: products } } } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId || "no-fixture" } });
    await prisma.user.deleteMany({ where: { id: userId || "no-fixture" } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.category.deleteMany({ where: { id: categoryId || "no-fixture" } });
  } finally {
    await prisma.$disconnect();
    await (globalThis as { pgPool?: Pool }).pgPool?.end();
  }
}, { timeout: 60000 });

test("concurrent first cart and wishlist requests create one container", async () => {
  const carts = await Promise.all(Array.from({ length: 8 }, () => getOrCreateCart(userId)));
  const lists = await Promise.all(Array.from({ length: 8 }, () => getOrCreateWishlist(userId)));
  assert.equal(new Set(carts.map(row => row.id)).size, 1);
  assert.equal(new Set(lists.map(row => row.id)).size, 1);
  assert.equal((await getOrCreateCart(userId)).updatedAt.getTime(), carts[0].updatedAt.getTime());
});

test("concurrent cart additions preserve both quantities", async () => {
  const responses = await Promise.all([1, 2].map(() => fetch(`${origin}/api/cart/items`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ variantId, quantity: 1 }),
  })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const cart = await getOrCreateCart(userId);
  const item = await prisma.cartItem.findUniqueOrThrow({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  assert.equal(item.quantity, 2);
  await request(`/api/cart/items/${item.id}`, "PATCH", { quantity: 3 });
  await request(`/api/cart/items/${item.id}`, "DELETE");
  await request(`/api/cart/items/${item.id}`, "PATCH", { quantity: 3 }, 404);
});

test("stale stock edits cannot overwrite reservations; restocks notify once", async () => {
  await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 8 } });
  const path = `/api/products/${productId}/variants/${variantId}`;
  await request(path, "PATCH", { stock: 10, expectedStock: 10 }, 409);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, 8);
  await prisma.stockAlert.create({ data: { userId, productId } });
  await request(path, "PATCH", { stock: 11, expectedStock: 8 });
  assert.equal((await prisma.inventoryMovement.findFirstOrThrow({ where: { variantId } })).quantityDelta, 3);
  assert.equal(await prisma.notification.count({ where: { userId, type: "STOCK" } }), 1);
  await prisma.stockAlert.update({ where: { userId_productId: { userId, productId } }, data: { notifiedAt: null } });
  await prisma.notification.deleteMany({ where: { userId, type: "STOCK" } });
  const alternate = await prisma.productVariant.create({ data: { productId, sku: `${prefix}-restock`, price: 1200, stock: 0 } });
  await Promise.all([variantId, alternate.id].map(id => request("/api/admin/inventory/adjust", "POST", { variantId: id, delta: 1, note: "Regression restock" })));
  assert.equal(await prisma.notification.count({ where: { userId, type: "STOCK" } }), 1);
});

test("COD confirmation and cancellation serialize without reviving orders", async () => {
  const target = await order();
  const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  const responses = await Promise.all([
    fetch(`${origin}/api/admin/orders/${target.id}/confirm`, { method: "POST", headers: { cookie } }),
    fetch(`${origin}/api/orders/${target.id}/cancel`, { method: "POST", headers: { cookie } }),
  ]);
  assert.ok([200, 409].includes(responses[0].status));
  assert.equal(responses[1].status, 200);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "CANCELLED");
  await request(`/api/admin/orders/${target.id}/confirm`, "POST", undefined, 409);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock + 1);
});

test("dispatched orders cannot be cancelled and restocked directly", async () => {
  const target = await order({ status: "SHIPPED" });
  await prisma.shipment.update({ where: { orderId: target.id }, data: { status: "SHIPPED" } });
  const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  await request(`/api/admin/orders/${target.id}/cancel`, "POST", undefined, 409);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock);
});

test("a carrier cancellation failure preserves the booking and reserved stock", async () => {
  const target = await order({ status: "PROCESSING" });
  await prisma.shipment.update({ where: { orderId: target.id }, data: { status: "PREPARING", bostaDeliveryId: `${prefix}-booking` } });
  const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  await request(`/api/admin/orders/${target.id}/cancel`, "POST", undefined, 502);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "PROCESSING");
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock);
});

test("early delivery and repeated callbacks settle COD and award points once", async () => {
  const target = await order({ status: "PROCESSING" });
  await Promise.all([1, 2].map(() => applyBostaWebhookStatus(target.id, target, "DELIVERED", "delivered")));
  await applyBostaWebhookStatus(target.id, target, "IN_TRANSIT", "late-transit");
  const current = await prisma.order.findUniqueOrThrow({ where: { id: target.id }, include: { payment: true, shipment: true } });
  assert.equal(current.status, "DELIVERED");
  assert.equal(current.paymentStatus, "PAID");
  assert.equal(current.payment?.status, "PAID");
  assert.equal(current.shipment?.status, "DELIVERED");
  assert.equal(await prisma.loyaltyTransaction.count({ where: { referenceId: target.id, type: "EARN" } }), 1);
});

test("catalog and wishlist choose and filter by current sale prices", async () => {
  await prisma.productVariant.update({ where: { id: variantId }, data: { price: 1000, salePrice: 700 } });
  await prisma.productVariant.create({ data: { productId, sku: `${prefix}-sale`, price: 1100, salePrice: 600, stock: 2 } });
  const second = await prisma.product.create({ data: {
    nameEn: `${prefix}-second`, nameAr: prefix, slug: `${prefix}-second`, categoryId,
    variants: { create: { sku: `${prefix}-second`, price: 550, stock: 1 } },
  } });
  products.push(second.id);
  const filters = { category: prefix, sort: "price_asc" as const };
  const result = await getProductList({ ...filters, maxPrice: 650 });
  assert.deepEqual(result.items.map(row => row.id), [second.id, productId]);
  assert.equal(result.items[1].variants[0].salePrice?.toNumber(), 600);
  const response = await request(`/api/products?category=${prefix}&sort=price_asc&maxPrice=650`);
  assert.deepEqual(response.data.map((row: { id: string }) => row.id), [second.id, productId]);
  const range = await getProductList({ ...filters, minPrice: 620, maxPrice: 800 });
  assert.equal(range.total, 1);
  assert.equal(range.items[0].variants[0].salePrice?.toNumber(), 700);
  const late = await getProductList({ ...filters, page: 99 });
  assert.equal(late.items.length, 0);
  assert.equal(late.total, 2);
  assert.equal((await getProductList({ ...filters, search: "%' OR true --" })).total, 0);
  const list = await getOrCreateWishlist(userId);
  await prisma.wishlistItem.create({ data: { wishlistId: list.id, productId } });
  assert.equal((await getWishlistForUser(userId))[0].product.variants[0].salePrice?.toNumber(), 600);
});

test("support staff enter admin through their permitted orders page", async () => {
  const target = await order();
  await prisma.user.update({ where: { id: userId }, data: { role: "SUPPORT" } });
  try {
    const response = await fetch(`${origin}/admin`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (response.status === 307) {
      assert.equal(new URL(response.headers.get("location")!, origin).pathname, "/admin/orders");
    } else {
      // Next.js can send a client redirect after the HTML stream has begun.
      assert.equal(response.status, 200);
      const redirect = (await response.text()).match(/<meta[^>]*http-equiv="refresh"[^>]*>/i)?.[0];
      assert.ok(redirect, "The streamed response must contain a redirect");
      assert.match(redirect, /content="[01];url=\/admin\/orders"/);
    }
    const ordersPage = await fetch(`${origin}/admin/orders`, { headers: { cookie }, signal: AbortSignal.timeout(30000) });
    assert.equal(ordersPage.status, 200);
    assert.ok((await ordersPage.text()).includes(`/admin/orders/${target.id}`), "Support must see the orders table");
    await request("/api/admin/inventory/adjust", "POST", { variantId, delta: 1, note: "Forbidden staff write" }, 403);
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  }
});

test("cancelled paid orders retain cancelled intents and reconcile replacement refunds", async () => {
  const target = await order({ status: "SHIPPED", paymentStatus: "PAID" }, { status: "PAID" });
  await prisma.shipment.update({ where: { orderId: target.id }, data: { status: "SHIPPED" } });
  const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  await Promise.all([1, 2].map(() => applyBostaWebhookStatus(target.id, target, "RETURNED", "returned")));
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock + 1);
  const path = `/api/admin/orders/${target.id}/refund`;
  await request(path, "POST", { amount: "25.00" }, 409);
  await request(path, "POST", { amount: "100.00" }, 201);
  await request(path, "DELETE", { reason: "Incorrect receipt selected", noTransferMade: true });
  await request(path, "POST", { amount: "100.00" }, 201);
  await request(path, "PATCH", { evidenceReference: `receipt-${prefix}` });
  await request(path, "PATCH", { evidenceReference: `receipt-${prefix}` });
  const rows = await prisma.refund.findMany({ where: { orderId: target.id } });
  assert.equal(rows.filter(row => row.status === "CANCELLED").length, 1);
  assert.equal(rows.filter(row => row.status === "CONFIRMED").length, 1);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).paymentStatus, "REFUNDED");
});

test("concurrent return refund creation reserves only one amount", async () => {
  const target = await order({ status: "DELIVERED", paymentStatus: "PAID" }, { status: "PAID" });
  const rr = await prisma.returnRequest.create({ data: {
    userId, orderId: target.id, reason: "Refund concurrency fixture", status: "RECEIVED",
    items: { create: { orderItemId: target.items[0].id, variantId, quantity: 1 } },
  } });
  const path = `/api/admin/returns/${rr.id}/refund`;
  const responses = await Promise.all([1, 2].map(() => fetch(`${origin}${path}`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ amount: "100.00" }),
  })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  await request(path, "PATCH", { evidenceReference: `return-${prefix}` });
  assert.equal((await prisma.returnRequest.findUniqueOrThrow({ where: { id: rr.id } })).status, "REFUNDED");
  assert.equal(await prisma.refund.count({ where: { orderId: target.id, status: "CONFIRMED" } }), 1);
});

test("all-points returns restore redeemed points without a cash refund", async () => {
  const target = await order({ status: "DELIVERED", paymentStatus: "PAID", discount: 100, total: 0, loyaltyPointsRedeemed: 100 }, { status: "PAID", amount: 0 });
  const rr = await prisma.returnRequest.create({ data: {
    userId, orderId: target.id, reason: "Regression fixture",
    items: { create: { orderItemId: target.items[0].id, variantId, quantity: 1 } },
  } });
  const points = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints;
  const path = `/api/admin/returns/${rr.id}`;
  await request(path, "PATCH", { status: "APPROVED" });
  await request(path, "PATCH", { status: "RECEIVED" });
  await request(path, "PATCH", { status: "RECEIVED" }, 409);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints, points + 100);
  assert.equal((await prisma.returnRequest.findUniqueOrThrow({ where: { id: rr.id } })).status, "REFUNDED");
  assert.equal(await prisma.refund.count({ where: { orderId: target.id } }), 0);
});

function capture(id: number, orderId: string) {
  return { id, order: { id: id + 10000, merchant_order_id: orderId }, amount_cents: 10000,
    created_at: "2026-10-20T12:00:00", currency: "EGP", error_occured: false, has_parent_transaction: false,
    integration_id: 7, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false,
    is_standalone_payment: true, is_voided: false, owner: 1, pending: false,
    source_data: { pan: "1234", sub_type: "MasterCard", type: "card" }, success: true,
    refunded_amount_cents_int: 0 };
}
function hmac(obj: ReturnType<typeof capture>) {
  return createHmac("sha512", secret).update([
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction,
    obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded,
    obj.is_standalone_payment, obj.is_voided, obj.order.id, obj.owner, obj.pending,
    obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success,
  ].map(String).join("")).digest("hex");
}

test("Paymob callback binds the signed provider order to authenticated merchant state", async () => {
  const original = await order({}, { method: "CARD" });
  const other = await order({}, { method: "CARD" });
  const payload = capture(transactionBase + 1, original.id);
  providerTransactions.set(String(payload.id), payload);
  const path = `/api/webhooks/paymob?hmac=${hmac(payload)}`;
  await request(path, "POST", { obj: { ...payload, order: { ...payload.order, merchant_order_id: other.id } } }, 409);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: other.id } })).paymentStatus, "PENDING");
  await request(path, "POST", { obj: payload });
  await request(path, "POST", { obj: payload });
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: original.id } })).paymentStatus, "PAID");
  const late = await order({ status: "CANCELLED" }, { method: "CARD" });
  const latePayload = capture(transactionBase + 2, late.id);
  providerTransactions.set(String(latePayload.id), latePayload);
  await request(`/api/webhooks/paymob?hmac=${hmac(latePayload)}`, "POST", { obj: latePayload });
  const current = await prisma.order.findUniqueOrThrow({ where: { id: late.id } });
  assert.equal(current.status, "CANCELLED");
  assert.equal(current.paymentStatus, "PAID");
  await request(`/api/admin/orders/${late.id}/refund`, "POST", { amount: "100.00" }, 201);
  // A provider-confirmed transfer prevents cancelling an apparently pending intent.
  providerTransactions.set(String(latePayload.id), { ...latePayload, refunded_amount_cents_int: 10000 });
  await request(`/api/admin/orders/${late.id}/refund`, "DELETE", { reason: "Cannot cancel paid refund", noTransferMade: true }, 409);
  await request(`/api/admin/orders/${late.id}/refund`, "PATCH", {});
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: late.id } })).paymentStatus, "REFUNDED");
  const wallet = await order({}, { method: "WALLET" });
  const wrongIntegration = capture(transactionBase + 3, wallet.id);
  providerTransactions.set(String(wrongIntegration.id), wrongIntegration);
  await request(`/api/webhooks/paymob?hmac=${hmac(wrongIntegration)}`, "POST", { obj: wrongIntegration }, 409);
});

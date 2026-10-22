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
import { mapBostaState } from "../lib/bosta";
import { withProductReviewLock } from "../lib/product-maintenance";
import { issueVerificationToken, consumeVerificationToken } from "../lib/verification-tokens";
import bcrypt from "bcryptjs";
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
const extraUsers: string[] = [];

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
    if (req.url === "/api/v2/cities?apiVersion=1") return void res.end(JSON.stringify({ data: [{ _id: "fixture-city", name: "Cairo" }] }));
    if (req.url === "/api/v2/cities/fixture-city/zones?apiVersion=1") return void res.end(JSON.stringify({ data: [{ _id: "fixture-zone", name: "Nasr City" }] }));
    if (req.url === "/api/v2/cities/fixture-city/districts?apiVersion=1") return void res.end(JSON.stringify({ data: [{ zoneId: "fixture-zone", zoneName: "Nasr City", districtId: "fixture-district", districtName: "District 1" }] }));
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
    BOSTA_WEBHOOK_SECRET: secret,
    RESEND_API_KEY: "", NODE_ENV: "production", CRON_SECRET: secret,
  };
  const serverProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  app = serverProcess;
  serverProcess.stdout?.on("data", data => { serverOutput = (serverOutput + data).slice(-12000); });
  serverProcess.stderr?.on("data", data => { serverOutput = (serverOutput + data).slice(-12000); });
  let ready = false;
  for (let i = 0; i < 600; i++) {
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
}, { timeout: 180000 });

after(async () => {
  if (app && app.exitCode === null) {
    const stopped = new Promise<void>(resolve => app!.once("exit", () => resolve()));
    app.kill();
    await Promise.race([stopped, delay(5000)]);
  }
  if (provider) await new Promise<void>(resolve => provider.close(() => resolve()));
  try {
    // Cleanup is restricted to exact IDs created by this suite.
    await prisma.emailDelivery.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.review.deleteMany({ where: { productId: { in: products } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.inventoryMovement.deleteMany({ where: { variant: { productId: { in: products } } } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId || "no-fixture" } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, ...extraUsers] } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.category.deleteMany({ where: { id: categoryId || "no-fixture" } });
  } finally {
    await prisma.$disconnect();
    await (globalThis as { pgPool?: Pool }).pgPool?.end();
  }
}, { timeout: 180000 });

test("password changes revoke earlier reset links and serialize token issuance", async () => {
  const oldPassword = "Old-regression-password-1!";
  const newPassword = "New-regression-password-2!";
  const customer = await prisma.user.create({ data: { name: prefix, email: `${prefix}-password@example.invalid`, password: await bcrypt.hash(oldPassword, 10) } });
  extraUsers.push(customer.id);
  const resetToken = await issueVerificationToken(customer.id, "PASSWORD_RESET");
  const token = await encode({ secret, salt: "authjs.session-token", maxAge: 3600, token: {
    id: customer.id, sub: customer.id, email: customer.email, role: "CUSTOMER", sessionVersion: 0,
    authenticatedAt: Date.now(), authProvider: "credentials",
  } });
  const response = await fetch(`${origin}/api/account/password`, { method: "PATCH",
    headers: { cookie: `authjs.session-token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
  });
  assert.equal(response.status, 200, await response.text());
  await request("/api/auth/reset-password", "POST", { token: resetToken, password: "Attacker-password-3!" }, 400);
  const current = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(await bcrypt.compare(newPassword, current.password!), true);
  assert.equal(current.sessionVersion, 1);

  // Hold User before issuing a token in another connection. Issuance must
  // wait until revocation commits, rather than inserting into its snapshot.
  let pending!: Promise<string>;
  let issued = false;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${customer.id} FOR UPDATE`;
    pending = issueVerificationToken(customer.id, "PASSWORD_RESET").then(value => { issued = true; return value; });
    await delay(100);
    assert.equal(issued, false, "Issuance must wait for the password-operation lock");
    await tx.verificationToken.updateMany({ where: { userId: customer.id, type: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } });
  });
  const freshToken = await pending;
  assert.ok(await consumeVerificationToken(freshToken, "PASSWORD_RESET"));
  assert.equal(await consumeVerificationToken(freshToken, "PASSWORD_RESET"), null);
});

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
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { status: "RETURNED" }, 400);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { status: "RETURNED", receiptConfirmed: true });
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

test("lost and damaged shipments withhold inventory until an inspected physical receipt", async () => {
  for (const code of [100, 101, 48, 49, 46]) {
    const target = await order({ status: "SHIPPED" });
    await prisma.shipment.update({ where: { orderId: target.id }, data: { status: "SHIPPED" } });
    const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
    const status = mapBostaState(code)!;
    await Promise.all([1, 2].map(() => applyBostaWebhookStatus(target.id, target, status, String(code))));
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "CANCELLED");
    if (status !== "AWAITING_RECEIPT") await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { status: "AWAITING_RECEIPT" });
    await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { status: "RETURNED", receiptConfirmed: true });
    await applyBostaWebhookStatus(target.id, target, "AWAITING_RECEIPT", "46");
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock + 1);
    assert.equal(await prisma.inventoryMovement.count({ where: { referenceId: target.id, type: "RETURN" } }), 1);
  }
});

test("manual online capture requires provider verification and repairs a legacy payment reference", async () => {
  const target = await order({ status: "CONFIRMED", paymentStatus: "PAID" }, { method: "CARD", status: "PAID" });
  const payload = capture(transactionBase + 10, target.id);
  providerTransactions.set(String(payload.id), payload);
  const path = `/api/admin/orders/${target.id}/payment/mark-paid`;
  await request(path, "POST", {}, 400);
  await request(path, "POST", { transactionId: String(payload.id) });
  await request(`/api/webhooks/paymob?hmac=${hmac(payload)}`, "POST", { obj: payload });
  const current = await prisma.payment.findUniqueOrThrow({ where: { orderId: target.id } });
  assert.equal(current.transactionId, String(payload.id));
  assert.equal(await prisma.orderEvent.count({ where: { orderId: target.id, title: "Payment reference reconciled" } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId, type: "PAYMENT", link: `/orders/${target.id}` } }), 0);
  const other = await order({}, { method: "CARD" });
  await request(`/api/admin/orders/${other.id}/payment/mark-paid`, "POST", { transactionId: String(payload.id) }, 409);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: other.id } })).status, "PENDING");
});

test("unresolved booking blocks cancellation and concurrent recovery resolves it once", async () => {
  const target = await order({ status: "PROCESSING" });
  await prisma.shipment.delete({ where: { orderId: target.id } });
  await prisma.shipmentBooking.create({ data: { orderId: target.id, status: "UNKNOWN", requestKey: randomUUID(), leaseUntil: new Date(0) } });
  await request(`/api/admin/orders/${target.id}/cancel`, "POST", undefined, 409);
  await request(`/api/admin/orders/${target.id}/shipment`, "POST", undefined, 409);
  const body = { action: "NO_BOOKING", attested: true, reason: "Verified absence in carrier dashboard" };
  const responses = await Promise.all([1, 2].map(() => fetch(`${origin}/api/admin/orders/${target.id}/shipment`, { method: "PATCH", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) })));
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "CONFIRMED");
  assert.equal((await prisma.shipmentBooking.findUniqueOrThrow({ where: { orderId: target.id } })).status, "CANCELLED");
});

test("callbacks survive booking recovery, verify identities and settle COD exactly once", async () => {
  const target = await order({ status: "PROCESSING" });
  await prisma.shipment.delete({ where: { orderId: target.id } });
  const delivery = `${prefix}-recovery-delivery`, tracking = `${prefix}-recovery-tracking`;
  const booking = await prisma.shipmentBooking.create({ data: { orderId: target.id, status: "UNKNOWN", requestKey: randomUUID(),
    leaseUntil: new Date(0), bostaDeliveryId: delivery, trackingNumber: tracking } });
  const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
  async function callback(data: Record<string, unknown>, authenticated = true) {
    const response = await fetch(`${origin}/api/webhooks/bosta`, { method: "POST",
      headers: { "Content-Type": "application/json", ...(authenticated ? { "x-webhook-secret": secret } : {}) },
      body: JSON.stringify({ _id: delivery, trackingNumber: tracking, businessReference: target.id, state: 45, ...data }) });
    assert.equal(response.status, authenticated ? 200 : 401, await response.text());
  }
  await callback({}, false);
  await callback({ _id: "wrong-delivery" });
  assert.equal(await prisma.shipmentBookingEvent.count({ where: { bookingId: booking.id } }), 0);
  await Promise.all([callback({}), callback({})]);
  assert.equal(await prisma.shipmentBookingEvent.count({ where: { bookingId: booking.id, processedAt: null } }), 1);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { action: "ATTACH", attested: true, reason: "Verified carrier delivery",
    bostaDeliveryId: delivery, trackingNumber: "wrong-tracking" }, 409);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { action: "ATTACH", attested: true, reason: "Verified carrier delivery",
    bostaDeliveryId: delivery, trackingNumber: tracking });
  await Promise.all([callback({}), callback({ state: 30 })]);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "DELIVERED");
  assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { orderId: target.id } })).status, "DELIVERED");
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: target.id } })).status, "PAID");
  assert.equal(await prisma.shipmentBookingEvent.count({ where: { bookingId: booking.id, processedAt: null } }), 0);
  assert.equal(await prisma.loyaltyTransaction.count({ where: { idempotencyKey: `delivery-earn:${target.id}` } }), 1);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stock);
});

test("callbacks can recognize an in-flight attempt by its order reference", async () => {
  const target = await order({ status: "PROCESSING" });
  await prisma.shipment.delete({ where: { orderId: target.id } });
  const booking = await prisma.shipmentBooking.create({ data: { orderId: target.id, requestKey: randomUUID(), leaseUntil: new Date(0) } });
  const delivery = `${prefix}-early-delivery`, tracking = `${prefix}-early-tracking`;
  const response = await fetch(`${origin}/api/webhooks/bosta`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify({ _id: delivery, trackingNumber: tracking, businessReference: target.id, state: 45 }) });
  assert.equal(response.status, 200);
  assert.equal(await prisma.shipmentBookingEvent.count({ where: { bookingId: booking.id } }), 1);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { action: "NO_BOOKING", attested: true, reason: "Must retain known carrier booking" }, 409);
  await request(`/api/admin/orders/${target.id}/shipment`, "PATCH", { action: "ATTACH", attested: true, reason: "Attach known carrier booking", bostaDeliveryId: delivery, trackingNumber: tracking });
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: target.id } })).status, "DELIVERED");
});

test("both variant routes enforce option ownership and record opening balances atomically", async () => {
  const target = await prisma.product.create({ data: { nameEn: prefix, nameAr: prefix, slug: `${prefix}-variants`, categoryId } });
  products.push(target.id);
  const own = await prisma.productOption.create({ data: { productId: target.id, nameEn: "Color", nameAr: "لون",
    values: { create: [{ valueEn: "Black", valueAr: "أسود" }, { valueEn: "White", valueAr: "أبيض" }] } }, include: { values: true } });
  const foreign = await prisma.productOption.create({ data: { productId, nameEn: `${prefix}-foreign`, nameAr: prefix,
    values: { create: { valueEn: "Other", valueAr: "آخر" } } }, include: { values: true } });
  const paths = [`/api/products/${target.id}/variants`, `/api/admin/products/${target.id}/options/variants`];
  for (const [index, path] of paths.entries()) {
    const body = { sku: `${prefix}-created-${index}`, price: 60 - index * 10, stock: 3 };
    for (const ids of [[foreign.values[0].id], [own.values[0].id, own.values[0].id], own.values.map(v => v.id), ["missing-value"]]) {
      await request(path, "POST", { ...body, optionValueIds: ids }, 400);
    }
    const created = (await request(path, "POST", { ...body, optionValueIds: [own.values[index].id] }, 201)).data;
    const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { variantId: created.id } });
    assert.equal(movement.quantityDelta, 3);
    assert.equal(movement.stockAfter, 3);
    assert.equal(await prisma.auditLog.count({ where: { entityId: created.id, action: "CREATE" } }), 1);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: target.id } })).startingPrice), body.price);
    await request(path, "POST", { ...body, sku: `${body.sku}-duplicate`, optionValueIds: [own.values[index].id] }, 409);
  }
  for (const base of [`/api/products/${target.id}`, `/api/admin/products/${target.id}`]) {
    await request(`${base}/options/${foreign.id}/values`, "POST", { valueEn: "Invalid", valueAr: "غير صالح" }, 404);
  }
  const third = await prisma.productOptionValue.create({ data: { optionId: own.id, valueEn: "Blue", valueAr: "أزرق" } });
  const responses = await Promise.all(paths.map((path, i) => fetch(`${origin}${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ sku: `${prefix}-race-${i}`, price: 40, stock: 2, optionValueIds: [third.id] }) })));
  assert.deepEqual(responses.map(res => res.status).sort(), [201, 409]);
});

test("insufficient loyalty points return a conflict and preserve cart, stock and balance", async () => {
  const address = await prisma.address.create({ data: { userId, firstName: "Test", lastName: "Customer", phone: "01000000000",
    country: "Egypt", governorate: "Cairo", city: "Nasr City", street: "Fixture street", bostaCityId: "fixture-city", bostaDistrictId: "fixture-district" } });
  const cart = await getOrCreateCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cartItem.create({ data: { cartId: cart.id, variantId, quantity: 1 } });
  const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  const customer = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({ where: { id: userId }, data: { loyaltyPoints: 0 } });
  const checkoutKey = randomUUID();
  try {
    const result = await request("/api/checkout", "POST", { addressId: address.id, paymentMethod: "CASH_ON_DELIVERY", loyaltyPointsToRedeem: 10, checkoutKey }, 409);
    assert.equal(result.code, "INSUFFICIENT_LOYALTY_POINTS");
    assert.equal(result.loyaltyPoints, 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints, 0);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, before.stock);
    assert.equal((await prisma.cartItem.findUniqueOrThrow({ where: { cartId_variantId: { cartId: cart.id, variantId } } })).quantity, 1);
    assert.equal(await prisma.order.count({ where: { checkoutKey } }), 0);
    assert.equal(await prisma.loyaltyTransaction.count({ where: { referenceType: "CHECKOUT", referenceId: checkoutKey } }), 0);
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { loyaltyPoints: customer.loyaltyPoints } });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
});

test("address default updates accept null fields and reject stale carrier locations", async () => {
  const input = { firstName: "Fixture", lastName: "Customer", phone: "01000000000", country: "Egypt", governorate: "Cairo", city: "Nasr City", street: "Fixture street", apartment: null, postalCode: null, buildingNo: null, area: null, bostaCityId: null, bostaDistrictId: null, isDefault: false };
  const first = (await request("/api/addresses", "POST", input, 201)).data;
  const second = (await request("/api/addresses", "POST", { ...input, street: "Second street" }, 201)).data;
  await request(`/api/addresses/${second.id}`, "PATCH", { ...second, isDefault: true });
  assert.equal(await prisma.address.count({ where: { userId, isDefault: true } }), 1);
  assert.equal((await prisma.address.findUniqueOrThrow({ where: { id: first.id } })).isDefault, false);
  await request(`/api/addresses/${second.id}`, "PATCH", { ...second, bostaCityId: "fixture-city", bostaDistrictId: "old-district" }, 400);
  await request(`/api/addresses/${second.id}`, "PATCH", { ...second, bostaCityId: "fixture-city", bostaDistrictId: "fixture-district" });
  await request(`/api/addresses/${second.id}`, "PATCH", { ...second, governorate: "Giza", bostaCityId: "fixture-city", bostaDistrictId: "fixture-district" }, 400);
});

test("referral registrations retain their referrer in the database", async () => {
  const referralCode = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  await prisma.user.update({ where: { id: userId }, data: { referralCode } });
  const result = await request("/api/auth/register", "POST", { name: prefix, email: `${prefix}-referred@example.invalid`, password: "FixturePassword123!", referralCode }, 201);
  extraUsers.push(result.data.id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: result.data.id } })).referredById, userId);
});

test("wishlist and history HTTP results use sale prices and hide archived products", async () => {
  await request("/api/wishlist", "PUT", { productId, saved: true });
  await request("/api/wishlist", "PUT", { productId, saved: true });
  assert.equal(await prisma.wishlistItem.count({ where: { productId, wishlist: { userId } } }), 1);
  await request("/api/recently-viewed", "POST", { productId });
  for (const path of ["/api/wishlist", "/api/recently-viewed"]) {
    const found = (await request(path)).data.find((row: { product: { id: string } }) => row.product.id === productId);
    assert.equal(found.product.variants[0].effectivePrice, 600);
    assert.equal(found.product.variants[0].saleActive, true);
  }
  await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });
  try {
    for (const path of ["/api/wishlist", "/api/recently-viewed"]) assert.equal((await request(path)).data.some((row: { product: { id: string } }) => row.product.id === productId), false);
  } finally { await prisma.product.update({ where: { id: productId }, data: { deletedAt: null } }); }
  await request("/api/wishlist", "DELETE", { productId });
  await request("/api/wishlist", "DELETE", { productId });
});

test("concurrent review mutations keep the persisted rating equal to the committed reviews", async () => {
  const other = await prisma.user.create({ data: { name: prefix, email: `${prefix}-review@example.invalid` } });
  extraUsers.push(other.id);
  const firstOrder = await order({ status: "DELIVERED" });
  const secondOrder = await order({ status: "DELIVERED", userId: other.id });
  const reviews = await Promise.all([[userId, firstOrder.items[0].id, 5], [other.id, secondOrder.items[0].id, 1]].map(([reviewUser, orderItemId, rating]) => withProductReviewLock(productId, tx => tx.review.create({ data: { userId: String(reviewUser), orderItemId: String(orderItemId), productId, rating: Number(rating) } }))));
  let product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  assert.equal(product.reviewCount, 2);
  assert.equal(product.averageRating.toNumber(), 3);
  await Promise.all([request(`/api/reviews/${reviews[0].id}`, "PATCH", { rating: 4 }), request(`/api/reviews/${reviews[1].id}`, "DELETE")]);
  const aggregate = await prisma.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
  product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  assert.equal(product.reviewCount, aggregate._count);
  assert.equal(product.averageRating.toNumber(), aggregate._avg.rating);
});

test("email leases and immutable provider keys survive overlap, completion failure and expired retries", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_fixture";
  const accepted = new Map<string, string>();
  const calls: { key: string; payload: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.resend.com/")) return originalFetch(input, init);
    const key = new Headers(init?.headers).get("idempotency-key");
    assert.ok(key);
    const payload = String(init?.body);
    calls.push({ key, payload });
    if (accepted.has(key)) assert.equal(accepted.get(key), payload);
    else accepted.set(key, payload);
    await delay(100);
    return Response.json({ id: "fixture-message" });
  };
  try {
    const { deliverEmail } = await import("../lib/email-delivery");
    const payload = { to: "fixture@example.invalid", subject: "Fixture", html: "<p>Fixture</p>" };
    const notification = await prisma.notification.create({ data: { userId, type: "ORDER", title: prefix, message: prefix } });
    const complete = (tx: Prisma.TransactionClient) => tx.notification.updateMany({ where: { id: notification.id, emailSentAt: null }, data: { emailSentAt: new Date() } });
    const key = prefix + "/email-overlap";
    await Promise.all([1, 2, 3].map(() => deliverEmail(key, payload, complete)));
    assert.equal(calls.filter(row => row.key === key).length, 1);
    assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailSentAt);
    const retryKey = prefix + "/email-retry";
    await assert.rejects(() => deliverEmail(retryKey, payload, async () => { throw new Error("Injected completion failure"); }));
    await deliverEmail(retryKey, { ...payload, subject: "Changed after first attempt" }, complete);
    assert.equal(calls.filter(row => row.key === retryKey).length, 2);
    assert.equal(accepted.size, 2);
    const reviewKey = prefix + "/email-review";
    await prisma.emailDelivery.create({ data: { key: reviewKey, payload, firstAttemptAt: new Date(Date.now() - 24 * 3600000) } });
    assert.equal(await deliverEmail(reviewKey, payload, complete), "review");
    assert.equal(calls.some(row => row.key === reviewKey), false);
    await request("/api/admin/email-deliveries", "PATCH", { key: reviewKey, evidence: "Verified provider message reference fixture", confirmedDelivered: true });
    assert.equal((await prisma.emailDelivery.findUniqueOrThrow({ where: { key: reviewKey } })).status, "SENT");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
  }
});

test("the production invoice endpoint embeds Arabic text in a downloadable PDF", async () => {
  const target = await order();
  const productName = "\u0647\u0627\u062a\u0641 \u0627\u062e\u062a\u0628\u0627\u0631";
  await prisma.orderItem.update({ where: { id: target.items[0].id }, data: { productName } });
  const response = await fetch(`${origin}/api/orders/${target.id}/invoice`, { headers: { cookie }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/pdf/);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const text = content.items.map(item => "str" in item ? item.str : "").join("");
    assert.ok(text.includes(productName));
    assert.ok(text.includes("TOTAL: EGP 100.00"));
  } finally { await task.destroy(); }
});

test("email cron queues run safely without email credentials and require scheduler authentication", async () => {
  for (const path of ["/api/cron/notification-emails", "/api/cron/abandoned-carts"]) {
    const denied = await fetch(origin + path);
    assert.equal(denied.status, 401);
    const response = await fetch(origin + path, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).emailEnabled, false);
  }
});


test("continued review: bcrypt silently ignores password suffixes beyond 72 bytes", async () => {
  const { registerSchema } = await import("../lib/validations/auth");
  const first = "A".repeat(72) + "1-original";
  const second = "A".repeat(72) + "2-different";
  for (const password of [first, second]) assert.equal(registerSchema.safeParse({ name: "Audit", email: "audit@example.invalid", password }).success, true);
  assert.equal(await bcrypt.compare(second, await bcrypt.hash(first, 10)), true);
  console.log("OBSERVED password collision: two schema-valid passwords with distinct suffixes authenticate against the same hash");
});

test("continued review: variants accept incomplete selections and duplicate empty selections", async () => {
  const product = await prisma.product.create({ data: { categoryId, nameEn: prefix, nameAr: prefix, slug: `${prefix}-incomplete`, options: { create: [
    { nameEn: "Size", nameAr: "Size", values: { create: { valueEn: "Large", valueAr: "Large" } } },
    { nameEn: "Color", nameAr: "Color", values: { create: { valueEn: "Blue", valueAr: "Blue" } } },
  ] } }, include: { options: { include: { values: true } } } });
  products.push(product.id);
  const result = await request(`/api/products/${product.id}/variants`, "POST", { sku: `${prefix}-partial`, price: 100, stock: 3, optionValueIds: [product.options[0].values[0].id] }, 201);
  assert.equal(result.data.optionValues.length, 1);
  assert.equal(product.options.length, 2);
  for (let i = 0; i < 2; i++) await request(`/api/products/${product.id}/variants`, "POST", { sku: `${prefix}-empty-${i}`, price: 100, stock: 3, optionValueIds: [] }, 201);
  assert.equal(await prisma.productVariant.count({ where: { productId: product.id, optionValues: { none: {} } } }), 2);
  console.log("OBSERVED variant integrity: partial 1-of-2 selection and two empty combinations all returned 201");
});

test("continued review: fractional-piaster prices persist into order and payment totals", async () => {
  const product = await prisma.product.create({ data: { categoryId, nameEn: prefix, nameAr: prefix, slug: `${prefix}-fractional` } });
  products.push(product.id);
  const created = await request(`/api/products/${product.id}/variants`, "POST", { sku: `${prefix}-fractional`, price: 12.345, stock: 3 }, 201);
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  await request("/api/cart/items", "POST", { variantId: created.data.id, quantity: 1 }, 201);
  const address = await prisma.address.create({ data: { userId, firstName: "Audit", lastName: "Customer", phone: "01000000000", country: "Egypt", governorate: "Cairo", city: "Nasr City", area: "District 1", street: "Test only", bostaCityId: "fixture-city", bostaDistrictId: "fixture-district" } });
  const checkout = await request("/api/checkout", "POST", { addressId: address.id, paymentMethod: "CASH_ON_DELIVERY", checkoutKey: randomUUID() }, 201);
  orders.push(checkout.data.id);
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: checkout.data.id }, include: { payment: true } });
  assert.equal(saved.subtotal.toString(), "12.345");
  assert.ok(saved.total.decimalPlaces() > 2);
  assert.equal(saved.payment!.amount.toString(), saved.total.toString());
  console.log(`OBSERVED currency precision: subtotal=${saved.subtotal}, total=${saved.total}, payment=${saved.payment!.amount}`);
});

test("continued review: updating inactive stock consumes an unavailable-product alert", async () => {
  const product = await prisma.product.create({ data: { categoryId, nameEn: prefix, nameAr: prefix, slug: `${prefix}-alert`, variants: { create: [
    { sku: `${prefix}-active-empty`, price: 100, stock: 0 },
    { sku: `${prefix}-inactive-empty`, price: 100, stock: 0, isActive: false },
  ] } }, include: { variants: true } });
  products.push(product.id);
  await request("/api/stock-alerts", "POST", { productId: product.id }, 201);
  const inactive = product.variants.find(v => !v.isActive)!;
  await request(`/api/products/${product.id}/variants/${inactive.id}`, "PATCH", { stock: 3, expectedStock: 0 });
  const alert = await prisma.stockAlert.findUniqueOrThrow({ where: { userId_productId: { userId, productId: product.id } } });
  assert.ok(alert.notifiedAt);
  assert.equal(await prisma.productVariant.count({ where: { productId: product.id, isActive: true, stock: { gt: 0 } } }), 0);
  assert.equal(await prisma.notification.count({ where: { userId, type: "STOCK", link: `/products/${product.slug}` } }), 1);
  console.log("OBSERVED stock alert: notification sent and subscription consumed while active sellable stock remains zero");
});

test("continued review: split returns strand a cent of the merchandise refund", async () => {
  const source = await prisma.order.create({ data: {
    userId, status: "DELIVERED", paymentStatus: "PAID", subtotal: 3, discount: 2, total: 1,
    shippingFirstName: "Audit", shippingLastName: "Customer", shippingPhone: "01000000000", shippingCountry: "Egypt", shippingGovernorate: "Cairo", shippingCity: "Cairo", shippingStreet: "Test only",
    items: { create: { variantId, quantity: 3, productName: prefix, sku: prefix, unitPrice: 1, totalPrice: 3 } },
    payment: { create: { method: "CASH_ON_DELIVERY", status: "PAID", amount: 1, paidAt: new Date() } },
  }, include: { items: true } });
  orders.push(source.id);
  const returnIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const rr = await request("/api/returns", "POST", { orderId: source.id, reason: "Synthetic review fixture", items: [{ orderItemId: source.items[0].id, quantity: 1 }] }, 201);
    returnIds.push(rr.data.id);
    await request(`/api/admin/returns/${rr.data.id}`, "PATCH", { status: "APPROVED" });
    await request(`/api/admin/returns/${rr.data.id}`, "PATCH", { status: "RECEIVED" });
    await request(`/api/admin/returns/${rr.data.id}/refund`, "POST", { amount: "0.33" }, 201);
    await request(`/api/admin/returns/${rr.data.id}/refund`, "PATCH", { evidenceReference: `AUDIT-RECEIPT-${i}` });
  }
  const total = await prisma.refund.aggregate({ where: { orderId: source.id, status: "CONFIRMED" }, _sum: { amount: true } });
  assert.equal(total._sum.amount!.toString(), "0.99");
  assert.equal(await prisma.returnRequest.count({ where: { id: { in: returnIds }, status: "REFUNDED" } }), 3);
  await request(`/api/admin/returns/${returnIds[2]}/refund`, "POST", { amount: "0.01" }, 409);
  await request(`/api/admin/orders/${source.id}/refund`, "POST", { amount: "0.01" }, 409);
  console.log("OBSERVED split-return refund: all 3 units returned, all requests REFUNDED, 0.99/1.00 settled, both remaining-refund routes reject 409");
});

test("continued review: order histories stop at fifty with no page traversal", async () => {
  const records = Array.from({ length: 51 }, (_, i) => ({ id: `${prefix}-history-${i}`, userId,
    subtotal: 1, total: 1, status: "PENDING" as const,
    shippingFirstName: "Audit", shippingLastName: "History", shippingPhone: "01000000000", shippingCountry: "Egypt", shippingGovernorate: "Cairo", shippingCity: "Cairo", shippingStreet: "Fixture",
    createdAt: new Date(Date.now() + i * 1000),
  }));
  await prisma.order.createMany({ data: records });
  orders.push(...records.map(row => row.id));
  const { getAllOrders } = await import("../lib/queries/admin-orders");
  const { getOrdersForUser } = await import("../lib/queries/orders");
  const first = await getOrdersForUser(userId);
  assert.equal(first.length, 50);
  assert.equal(first.some(row => row.id === records[0].id), false);
  assert.equal((await getAllOrders()).some(row => row.id === records[0].id), false);
  const apiOrders = await request("/api/orders");
  assert.ok(apiOrders.data.some((row: { id: string }) => row.id === records[0].id));
  console.log("OBSERVED order truncation: 51 fixture orders, oldest absent in both page queries while still present in customer API");
});

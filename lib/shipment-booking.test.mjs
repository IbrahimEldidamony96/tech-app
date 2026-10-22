import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
let order, booking, shipment, failAttach, providerMode, bookings;
class CarrierError extends Error { constructor(status) { super("Injected carrier failure"); this.status = status; } }
const db = {
  $queryRaw: async () => [],
  $transaction: async fn => fn(db),
  order: {
    findUnique: async () => ({ ...order, shipment, shipmentBooking: booking }),
    update: async ({ data }) => Object.assign(order, data),
    updateMany: async ({ where, data }) => order.status === where.status ? (Object.assign(order, data), { count: 1 }) : { count: 0 },
  },
  shipmentBooking: {
    findUnique: async () => booking,
    upsert: async ({ create, update }) => (booking = booking ? Object.assign(booking, update) : { status: "REQUESTING", ...create }),
    update: async ({ data }) => Object.assign(booking, data),
    updateMany: async ({ where, data }) => {
      if (!booking || booking.requestKey !== where.requestKey || (Array.isArray(where.status?.in) ? !where.status.in.includes(booking.status) : booking.status !== where.status)) return { count: 0 };
      Object.assign(booking, data); return { count: 1 };
    },
  },
  shipment: {
    findUnique: async () => shipment,
    findUniqueOrThrow: async () => shipment,
    create: async ({ data }) => { if (failAttach) throw new Error("Injected persistence failure"); shipment = { id: "shipment", ...data }; return shipment; },
  },
  auditLog: { create: async () => ({}) },
};
const stubs = new Map([
  ["@/lib/bosta-events", { replayBookingEvents: async () => {} }],
  ["@/lib/prisma", { prisma: db }],
  ["@/lib/bosta", {
    BostaApiError: CarrierError, resolveBostaCityIdCached: async () => "city", resolveBostaDistrictIdCached: async () => "district",
    createBostaDelivery: async () => { bookings++; if (providerMode) throw new CarrierError(providerMode); return { bostaDeliveryId: "delivery", trackingNumber: "123" }; },
    cancelBostaDelivery: async () => {},
  }],
]);
Module._load = function(id, ...rest) { return stubs.has(id) ? stubs.get(id) : originalLoad.call(this, id, ...rest); };
const { createShipmentBooking, recoverShipmentBooking } = require("./shipment-booking.ts");
beforeEach(() => {
  order = { id: "order", status: "CONFIRMED", payment: { method: "CASH_ON_DELIVERY" }, total: { toNumber: () => 100 }, items: [{ quantity: 1 }] };
  booking = shipment = null; failAttach = false; providerMode = undefined; bookings = 0;
});
after(() => { Module._load = originalLoad; });

test("a successful carrier booking survives local persistence failure and can be attached without rebooking", async () => {
  failAttach = true;
  await assert.rejects(() => createShipmentBooking("order", "actor"), error => error.status === 502);
  assert.equal(bookings, 1);
  assert.equal(order.status, "PROCESSING");
  assert.equal(booking.status, "UNKNOWN");
  assert.equal(booking.bostaDeliveryId, "delivery");
  assert.equal(shipment, null);
  await assert.rejects(() => createShipmentBooking("order", "actor"), error => error.status === 409);
  assert.equal(bookings, 1);
  await assert.rejects(() => recoverShipmentBooking("order", "actor", { action: "NO_BOOKING", reason: "Incorrect carrier decision" }));
  failAttach = false;
  await recoverShipmentBooking("order", "actor", { action: "ATTACH", reason: "Verified the carrier dashboard", bostaDeliveryId: "delivery", trackingNumber: "123" });
  assert.equal(booking.status, "BOOKED");
  assert.equal(shipment.bostaDeliveryId, "delivery");
  assert.equal(bookings, 1);
});

test("an ambiguous carrier timeout reserves the order until an operator verifies no booking exists", async () => {
  providerMode = 408;
  await assert.rejects(() => createShipmentBooking("order", "actor"), error => error.status === 502);
  assert.equal(order.status, "PROCESSING");
  assert.equal(booking.status, "UNKNOWN");
  await assert.rejects(() => createShipmentBooking("order", "actor"));
  await recoverShipmentBooking("order", "actor", { action: "NO_BOOKING", reason: "Carrier dashboard confirms absence" });
  assert.equal(order.status, "CONFIRMED");
  assert.equal(booking.status, "CANCELLED");
  assert.equal(bookings, 1);
});

test("an unverified online payment cannot reserve or book a shipment", async () => {
  order.payment = { method: "CARD", status: "PAID", transactionId: null };
  await assert.rejects(() => createShipmentBooking("order", "actor"), /Verify the online payment/);
  assert.equal(bookings, 0);
  assert.equal(booking, null);
  assert.equal(order.status, "CONFIRMED");
});

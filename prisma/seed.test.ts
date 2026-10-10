import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { seedDatabase } from "./seed";

type Row = Record<string, unknown>;
type Model = "user" | "category" | "brand" | "product" | "productVariant" | "coupon" | "order";
type State = Record<Model, Row[]>;
type Query = { where?: Row; data?: Row };

const emptyState = (): State => ({
  user: [], category: [], brand: [], product: [], productVariant: [], coupon: [], order: [],
});
const nestedCreates = (value: unknown): Row[] => {
  const create = (value as { create?: Row | Row[] } | undefined)?.create;
  return create ? (Array.isArray(create) ? create : [create]) : [];
};
const matches = (record: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === "object" && "in" in value) {
    return (value.in as unknown[]).includes(record[key]);
  }
  return record[key] === value;
});

// A transaction commits only its working snapshot. Forbidden mutations fail immediately.
// The fake also deliberately returns option values in reverse order to catch positional links.
function fakeDatabase(initial = emptyState(), failSku?: string) {
  let state = structuredClone(initial);
  let sequence = 0;
  const writes: string[] = [];
  const client = {
    async $transaction(callback: (tx: object) => Promise<unknown>) {
      const working = structuredClone(state);
      const tx = Object.fromEntries((Object.keys(working) as Model[]).map((model) => [model, {
        async findMany({ where }: Query) { return working[model].filter((row) => matches(row, where)); },
        async findUnique({ where }: Query) { return working[model].find((row) => matches(row, where)) ?? null; },
        async findFirst({ where }: Query) { return working[model].find((row) => matches(row, where)) ?? null; },
        async create({ data = {} }: Query) {
          writes.push(`${model}.create`);
          if (model === "productVariant" && data.sku === failSku) throw new Error("Injected variant failure");
          const key = model === "user" ? "email" : model === "productVariant" ? "sku" : model === "coupon" ? "code" : "slug";
          if (data[key] && working[model].some((row) => row[key] === data[key])) throw new Error("Duplicate fixture");
          const row: Row = { ...structuredClone(data), id: `fixture-${++sequence}` };
          if (model === "product") {
            row.options = nestedCreates(data.options).map((option) => ({
              ...option, id: `fixture-${++sequence}`,
              values: nestedCreates(option.values).map((value) => ({ ...value, id: `fixture-${++sequence}` })).reverse(),
            })).reverse();
            row.images = nestedCreates(data.images);
          }
          if (model === "productVariant") row.optionValues = nestedCreates(data.optionValues);
          if (model === "user") row.addresses = nestedCreates(data.addresses);
          working[model].push(row);
          return row;
        },
        async update() { throw new Error(`Forbidden ${model}.update`); },
        async upsert() { throw new Error(`Forbidden ${model}.upsert`); },
        async delete() { throw new Error(`Forbidden ${model}.delete`); },
        async deleteMany() { throw new Error(`Forbidden ${model}.deleteMany`); },
      }]));
      const result = await callback(tx);
      state = working;
      return result;
    },
  };
  return {
    client: client as unknown as Pick<PrismaClient, "$transaction">,
    get state() { return state; },
    writes,
  };
}

function populatedState(): State {
  const state = emptyState();
  state.user = [
    { id: "existing-admin", email: "admin@techstore.com", password: "existing-hash", role: "CUSTOMER", addresses: [] },
    { id: "existing-ahmed", email: "ahmed@example.com", password: null, role: "SUPPORT", addresses: [{ street: "Changed address" }] },
    { id: "customer", email: "customer@example.com", password: "customer-hash", role: "CUSTOMER" },
  ];
  state.category = ["electronics", "phones", "laptops", "accessories"].map((slug) => ({ id: slug, slug, nameEn: "Custom category", parentId: null }));
  state.brand = ["apple", "samsung", "dell"].map((slug) => ({ id: slug, slug, name: "Custom brand" }));
  state.product = ["iphone-15", "samsung-galaxy-s24", "macbook-air-m2", "dell-xps-13", "wireless-mouse"].map((slug) => ({
    id: slug, slug, nameEn: "Edited product", isActive: false, deletedAt: new Date("2025-01-01"),
    options: [{ nameEn: "Changed option", values: [{ id: "custom-value", valueEn: "Changed value" }] }],
    images: [{ url: "https://example.com/custom.jpg" }],
  }));
  state.productVariant = [{ id: "sold-variant", sku: "IPH15-BLK-128", stock: 2, price: 42, productId: "iphone-15" }];
  state.coupon = [{ id: "coupon", code: "WELCOME10", usedCount: 12, value: 7, isActive: false, expiresAt: new Date("2020-01-01") }];
  state.order = [{ id: "order-1", total: 42 }, { id: "order-2", total: 99 }, { id: "order-3", total: 12 }];
  return state;
}

test("rerunning a populated seed preserves every record without a password or mutations", async () => {
  const initial = populatedState();
  const db = fakeDatabase(initial);
  const previous = process.env.ALLOW_DESTRUCTIVE_SEED;
  process.env.ALLOW_DESTRUCTIVE_SEED = "yes";
  try {
    const result = await seedDatabase(db.client);
    assert.deepEqual(result.created, { users: 0, categories: 0, brands: 0, products: 0, variants: 0, coupons: 0 });
    assert.deepEqual(db.state, initial);
    assert.deepEqual(db.writes, []);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DESTRUCTIVE_SEED;
    else process.env.ALLOW_DESTRUCTIVE_SEED = previous;
  }
});

test("missing or blank passwords are rejected before any write", async () => {
  for (const password of [undefined, "", "   "]) {
    const db = fakeDatabase();
    await assert.rejects(seedDatabase(db.client, password), /SEED_PASSWORD is required/);
    assert.deepEqual(db.writes, []);
    assert.deepEqual(db.state, emptyState());
  }
  const initial = populatedState();
  initial.user = initial.user.filter((user) => user.email !== "ahmed@example.com");
  initial.coupon = [];
  const db = fakeDatabase(initial);
  await assert.rejects(seedDatabase(db.client), /SEED_PASSWORD is required/);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.state, initial);
});

test("a fresh seed creates full graphs, hashes passwords, and a second run does nothing", async () => {
  const db = fakeDatabase();
  const password = "test-only-password";
  const result = await seedDatabase(db.client, password);
  assert.deepEqual(result.created, { users: 2, categories: 4, brands: 3, products: 5, variants: 11, coupons: 1 });
  for (const user of db.state.user) {
    assert.notEqual(user.password, password);
    assert.equal(await bcrypt.compare(password, user.password as string), true);
  }
  const iphone = db.state.product.find((product) => product.slug === "iphone-15")!;
  assert.equal(iphone.startingPrice, 999);
  const valueNames = new Map((iphone.options as Row[]).flatMap((option) =>
    (option.values as Row[]).map((value) => [value.id, `${option.nameEn}/${value.valueEn}`] as const),
  ));
  const black128 = db.state.productVariant.find((variant) => variant.sku === "IPH15-BLK-128")!;
  assert.deepEqual((black128.optionValues as Row[]).map((value) => valueNames.get(value.optionValueId)), ["Color/Black", "Storage/128GB"]);
  assert.equal((db.state.user.find((user) => user.email === "ahmed@example.com")!.addresses as Row[]).length, 1);
  const before = structuredClone(db.state);
  const previousWrites = db.writes.length;
  await seedDatabase(db.client);
  assert.equal(db.writes.length, previousWrites);
  assert.deepEqual(db.state, before);
});

test("a failure midway through variant creation rolls back the complete seed", async () => {
  const db = fakeDatabase(emptyState(), "IPH15-BLK-256");
  await assert.rejects(seedDatabase(db.client, "test-only-password"), /Injected variant failure/);
  assert.ok(db.writes.includes("product.create"));
  assert.ok(db.writes.includes("productVariant.create"));
  assert.deepEqual(db.state, emptyState());
});

test("missing fixtures are added without modifying customized existing data", async () => {
  const initial = populatedState();
  initial.product = initial.product.filter((product) => product.slug !== "wireless-mouse");
  initial.coupon = [];
  const db = fakeDatabase(initial);
  const result = await seedDatabase(db.client);
  assert.deepEqual(result.created, { users: 0, categories: 0, brands: 0, products: 1, variants: 1, coupons: 1 });
  assert.deepEqual(db.state.product.filter((product) => product.slug !== "wireless-mouse"), initial.product);
  assert.deepEqual(db.state.user, initial.user);
  assert.deepEqual(db.state.order, initial.order);
  assert.deepEqual(db.state.productVariant.filter((variant) => variant.sku !== "MOUSE-WL-01"), initial.productVariant);
});

test("a demo SKU reassigned to another product is preserved without a duplicate fixture", async () => {
  const initial = populatedState();
  initial.product = initial.product.filter((product) => product.slug !== "iphone-15");
  initial.productVariant[0].productId = "custom-product";
  const db = fakeDatabase(initial);
  const result = await seedDatabase(db.client);
  assert.deepEqual(result.skippedProducts, ["iphone-15"]);
  assert.deepEqual(db.state, initial);
  assert.deepEqual(db.writes, []);
});

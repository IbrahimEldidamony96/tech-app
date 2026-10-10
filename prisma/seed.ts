import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import bcrypt from "bcryptjs";

const users: Omit<Prisma.UserCreateInput, "password">[] = [
  { name: "Admin User", email: "admin@techstore.com", role: "ADMIN" },
  {
    name: "Ahmed Hassan", email: "ahmed@example.com", role: "CUSTOMER",
    addresses: {
      create: [{
        firstName: "Ahmed", lastName: "Hassan", phone: "+201001234567",
        country: "Egypt", governorate: "Cairo", city: "Nasr City",
        street: "10 Makram Ebeid St", buildingNo: "5", apartment: "12", isDefault: true,
      }],
    },
  },
];

type ProductFixture = {
  data: Omit<Prisma.ProductUncheckedCreateInput, "categoryId" | "brandId">;
  categorySlug: string;
  brandSlug?: string;
  variants: {
    sku: string;
    price: number;
    stock: number;
    // Resolve by names, never by the order returned by the database.
    values: [optionName: string, valueName: string][];
  }[];
};

const products: ProductFixture[] = [
  {
    categorySlug: "phones", brandSlug: "apple",
    data: {
      nameEn: "iPhone 15", nameAr: "آيفون 15", slug: "iphone-15",
      descriptionEn: "The latest iPhone with A16 chip and improved camera system.",
      descriptionAr: "أحدث آيفون بمعالج A16 ونظام كاميرا محسّن.",
      images: { create: [{ url: "https://placehold.co/600x600.png?text=iPhone+15", isPrimary: true }] },
      options: { create: [
        {
          nameEn: "Color", nameAr: "اللون",
          values: { create: [{ valueEn: "Black", valueAr: "أسود" }, { valueEn: "Blue", valueAr: "أزرق" }] },
        },
        {
          nameEn: "Storage", nameAr: "المساحة",
          values: { create: [{ valueEn: "128GB", valueAr: "128 جيجابايت" }, { valueEn: "256GB", valueAr: "256 جيجابايت" }] },
        },
      ] },
    },
    variants: [
      { sku: "IPH15-BLK-128", price: 999, stock: 40, values: [["Color", "Black"], ["Storage", "128GB"]] },
      { sku: "IPH15-BLK-256", price: 1099, stock: 25, values: [["Color", "Black"], ["Storage", "256GB"]] },
      { sku: "IPH15-BLU-128", price: 999, stock: 30, values: [["Color", "Blue"], ["Storage", "128GB"]] },
      { sku: "IPH15-BLU-256", price: 1099, stock: 15, values: [["Color", "Blue"], ["Storage", "256GB"]] },
    ],
  },
  {
    categorySlug: "phones", brandSlug: "samsung",
    data: {
      nameEn: "Samsung Galaxy S24", nameAr: "سامسونج جالاكسي S24", slug: "samsung-galaxy-s24",
      descriptionEn: "Flagship Samsung phone with AI features.",
      descriptionAr: "هاتف سامسونج الرائد بمزايا الذكاء الاصطناعي.",
      images: { create: [{ url: "https://placehold.co/600x600.png?text=Galaxy+S24", isPrimary: true }] },
      options: { create: [{
        nameEn: "Color", nameAr: "اللون",
        values: { create: [{ valueEn: "Black", valueAr: "أسود" }, { valueEn: "White", valueAr: "أبيض" }] },
      }] },
    },
    variants: [
      { sku: "GAL24-BLK", price: 899, stock: 35, values: [["Color", "Black"]] },
      { sku: "GAL24-WHT", price: 899, stock: 20, values: [["Color", "White"]] },
    ],
  },
  {
    categorySlug: "laptops", brandSlug: "apple",
    data: {
      nameEn: "MacBook Air M2", nameAr: "ماك بوك اير M2", slug: "macbook-air-m2",
      descriptionEn: "Thin and light laptop powered by the Apple M2 chip.",
      descriptionAr: "لابتوب خفيف ورفيع بمعالج Apple M2.",
      images: { create: [{ url: "https://placehold.co/600x600.png?text=MacBook+Air", isPrimary: true }] },
      options: { create: [{
        nameEn: "Storage", nameAr: "المساحة",
        values: { create: [{ valueEn: "256GB", valueAr: "256 جيجابايت" }, { valueEn: "512GB", valueAr: "512 جيجابايت" }] },
      }] },
    },
    variants: [
      { sku: "MBA-M2-256", price: 1099, stock: 20, values: [["Storage", "256GB"]] },
      { sku: "MBA-M2-512", price: 1299, stock: 12, values: [["Storage", "512GB"]] },
    ],
  },
  {
    categorySlug: "laptops", brandSlug: "dell",
    data: {
      nameEn: "Dell XPS 13", nameAr: "ديل XPS 13", slug: "dell-xps-13",
      descriptionEn: "Compact Windows ultrabook with an InfinityEdge display.",
      descriptionAr: "لابتوب ويندوز مدمج بشاشة InfinityEdge.",
      images: { create: [{ url: "https://placehold.co/600x600.png?text=Dell+XPS+13", isPrimary: true }] },
      options: { create: [{
        nameEn: "RAM", nameAr: "الرام",
        values: { create: [{ valueEn: "8GB", valueAr: "8 جيجابايت" }, { valueEn: "16GB", valueAr: "16 جيجابايت" }] },
      }] },
    },
    variants: [
      { sku: "XPS13-8GB", price: 949, stock: 18, values: [["RAM", "8GB"]] },
      { sku: "XPS13-16GB", price: 1149, stock: 10, values: [["RAM", "16GB"]] },
    ],
  },
  {
    categorySlug: "accessories",
    data: {
      nameEn: "Wireless Mouse", nameAr: "ماوس لاسلكي", slug: "wireless-mouse",
      descriptionEn: "Ergonomic wireless mouse with long battery life.",
      descriptionAr: "ماوس لاسلكي مريح بعمر بطارية طويل.",
      images: { create: [{ url: "https://placehold.co/600x600.png?text=Wireless+Mouse", isPrimary: true }] },
    },
    variants: [{ sku: "MOUSE-WL-01", price: 29.99, stock: 100, values: [] }],
  },
];

/** Add missing demo fixtures. Existing records and their related data are never changed. */
export async function seedDatabase(
  prisma: Pick<PrismaClient, "$transaction">,
  seedPassword?: string,
) {
  return prisma.$transaction(async (tx) => {
    const created = { users: 0, categories: 0, brands: 0, products: 0, variants: 0, coupons: 0 };
    const skippedProducts: string[] = [];
    const existingUsers = await tx.user.findMany({
      where: { email: { in: users.map((user) => user.email) } }, select: { email: true },
    });
    const emails = new Set(existingUsers.map((user) => user.email));
    const missingUsers = users.filter((user) => !emails.has(user.email));

    // Validate before any writes so a configuration mistake cannot leave a partial seed.
    if (missingUsers.length && !seedPassword?.trim()) {
      throw new Error(
        "SEED_PASSWORD is required to create missing demo users. " +
        "Set it in .env and rerun; existing accounts and passwords will be preserved.",
      );
    }
    const password = missingUsers.length ? await bcrypt.hash(seedPassword!, 10) : undefined;
    for (const user of missingUsers) {
      await tx.user.create({ data: { ...user, password } });
      created.users++;
    }

    const categoryIds = new Map<string, string>();
    const categories = [
      { nameEn: "Electronics", nameAr: "إلكترونيات", slug: "electronics" },
      { nameEn: "Phones", nameAr: "هواتف", slug: "phones" },
      { nameEn: "Laptops", nameAr: "لابتوبات", slug: "laptops" },
      { nameEn: "Accessories", nameAr: "إكسسوارات", slug: "accessories" },
    ];
    for (const category of categories) {
      let record = await tx.category.findUnique({ where: { slug: category.slug }, select: { id: true } });
      if (!record) {
        record = await tx.category.create({
          data: { ...category, parentId: categoryIds.get("electronics") }, select: { id: true },
        });
        created.categories++;
      }
      categoryIds.set(category.slug, record.id);
    }

    const brandIds = new Map<string, string>();
    for (const brand of [{ name: "Apple", slug: "apple" }, { name: "Samsung", slug: "samsung" }, { name: "Dell", slug: "dell" }]) {
      let record = await tx.brand.findUnique({ where: { slug: brand.slug }, select: { id: true } });
      if (!record) {
        record = await tx.brand.create({ data: brand, select: { id: true } });
        created.brands++;
      }
      brandIds.set(brand.slug, record.id);
    }

    for (const fixture of products) {
      const existingProduct = await tx.product.findUnique({ where: { slug: fixture.data.slug }, select: { id: true } });
      // A previously seeded product may have been edited, purchased, or deactivated.
      // Skip its entire graph, including variants, options, images, and inventory.
      if (existingProduct) continue;

      const reusedSku = await tx.productVariant.findFirst({
        where: { sku: { in: fixture.variants.map((variant) => variant.sku) } }, select: { sku: true },
      });
      if (reusedSku) {
        skippedProducts.push(fixture.data.slug);
        continue;
      }

      const product = await tx.product.create({
        data: {
          ...fixture.data,
          categoryId: categoryIds.get(fixture.categorySlug)!,
          brandId: fixture.brandSlug ? brandIds.get(fixture.brandSlug) : undefined,
          startingPrice: Math.min(...fixture.variants.map((variant) => variant.price)),
        },
        include: { options: { include: { values: true } } },
      });
      for (const variant of fixture.variants) {
        const optionValues = variant.values.map(([optionName, valueName]) => {
          const value = product.options.find((option) => option.nameEn === optionName)
            ?.values.find((optionValue) => optionValue.valueEn === valueName);
          if (!value) throw new Error(`Missing demo option ${optionName}/${valueName} for ${fixture.data.slug}.`);
          return { optionValueId: value.id };
        });
        await tx.productVariant.create({
          data: {
            productId: product.id, sku: variant.sku, price: variant.price, stock: variant.stock,
            optionValues: { create: optionValues },
          },
        });
        created.variants++;
      }
      created.products++;
    }

    if (!await tx.coupon.findUnique({ where: { code: "WELCOME10" }, select: { id: true } })) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);
      await tx.coupon.create({
        data: {
          code: "WELCOME10", type: "PERCENTAGE", value: 10, minOrderAmount: 500,
          maxDiscount: 200, usageLimitPerUser: 1, expiresAt,
        },
      });
      created.coupons++;
    }
    return { created, skippedProducts };
  }, { maxWait: 10_000, timeout: 60_000 });
}

async function main() {
  // Imports have no database side effects when seedDatabase is used by regression tests.
  await import("dotenv/config");
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("@/app/generated/prisma/client"), import("@prisma/adapter-pg"),
  ]);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const { created, skippedProducts } = await seedDatabase(prisma, process.env.SEED_PASSWORD);
    console.log("Seed complete. Existing data and passwords preserved.");
    console.log(`Added: ${created.users} users, ${created.categories} categories, ${created.brands} brands, ${created.products} products (${created.variants} variants), ${created.coupons} coupons.`);
    if (skippedProducts.length) console.log(`Skipped products with SKUs already in use: ${skippedProducts.join(", ")}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : "Unexpected error.");
    process.exitCode = 1;
  });
}

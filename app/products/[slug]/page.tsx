import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProductBySlug } from "@/lib/queries/product-detail";
import { getProductReviews } from "@/lib/queries/reviews";
import { localized } from "@/lib/locale";
import { isSaleActive } from "@/lib/product-pricing";
import { VariantSelector } from "@/components/variant-selector";
import { WishlistButton } from "@/components/wishlist-button";
import { ProductGallery } from "@/components/product-gallery";
import { ReviewsSection } from "@/components/reviews-section";
import { ProductCard } from "@/components/product-card";
import { ProductEngagement } from "@/components/product-engagement";
import type { AppLocale } from "@/i18n/request";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const locale = (await getLocale()) as AppLocale;
  const title = localized(locale, product.metaTitleEn ?? product.nameEn, product.metaTitleAr ?? product.nameAr);
  const description = localized(
    locale,
    product.metaDescriptionEn ?? product.descriptionEn ?? "",
    product.metaDescriptionAr ?? product.descriptionAr ?? "",
  ).slice(0, 160);
  const image = product.images[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title, description, type: "website", images: image ? [{ url: image }] : undefined },
  };
}

function serializeProduct(product: Awaited<ReturnType<typeof getProductBySlug>>, locale: AppLocale) {
  if (!product) return null;
  const cheapest = [...product.variants].sort((a,b)=>a.price.comparedTo(b.price))[0];
  const price = cheapest ? (isSaleActive(cheapest) ? cheapest.salePrice! : cheapest.price).toNumber() : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: localized(locale, product.nameEn, product.nameAr),
    description: localized(locale, product.descriptionEn ?? "", product.descriptionAr ?? ""),
    image: product.images.map((i)=>i.url),
    sku: cheapest?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    aggregateRating: product.reviewCount > 0 ? { "@type": "AggregateRating", ratingValue: product.averageRating.toNumber(), reviewCount: product.reviewCount } : undefined,
    offers: price !== undefined ? { "@type": "Offer", priceCurrency: "EGP", price, availability: product.variants.some(v=>v.stock>0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } : undefined,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("ProductPage");
  const storefront = await getTranslations("Storefront");
  const session = await auth();

  const [existingWishlist, reviews, relatedRaw, companionRows, bundleRows] = await Promise.all([
    session?.user ? prisma.wishlistItem.findFirst({ where: { productId: product.id, wishlist: { userId: session.user.id } }, select: { id: true } }) : Promise.resolve(null),
    getProductReviews(product.id, 1, 10),
    prisma.product.findMany({
      where: { id: { not: product.id }, category: { slug: product.category.slug }, isActive: true, deletedAt: null },
      orderBy: [{ averageRating: "desc" }, { createdAt: "desc" }], take: 4,
      select: { id:true,nameEn:true,nameAr:true,slug:true,images:{where:{isPrimary:true},take:1,select:{url:true,alt:true}},brand:{select:{name:true}},variants:{where:{isActive:true},orderBy:{price:"asc"},take:1,select:{price:true,salePrice:true,saleStartsAt:true,saleEndsAt:true,stock:true}} },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: "DELIVERED", items: { some: { variant: { productId: product.id } } } }, variant: { productId: { not: product.id }, product: { isActive: true, deletedAt: null } } },
      take: 50,
      select: { variant: { select: { productId: true } } },
    }),
    prisma.bundleItem.findMany({
      where: { productId: product.id, bundle: { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }] } },
      include: { bundle: { include: { items: { include: { product: { select: { id:true,slug:true,nameEn:true,nameAr:true } } } } } } },
      take: 4,
    }),
  ]);

  const companionCounts = new Map<string, number>();
  for (const row of companionRows) companionCounts.set(row.variant.productId, (companionCounts.get(row.variant.productId) ?? 0) + 1);
  const companionIds = [...companionCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id])=>id);
  const companions = companionIds.length ? await prisma.product.findMany({
    where: { id: { in: companionIds }, isActive: true, deletedAt: null },
    select: { id:true,nameEn:true,nameAr:true,slug:true,images:{where:{isPrimary:true},take:1,select:{url:true,alt:true}},brand:{select:{name:true}},variants:{where:{isActive:true},orderBy:{price:"asc"},take:1,select:{price:true,salePrice:true,saleStartsAt:true,saleEndsAt:true,stock:true}} },
  }) : [];
  companions.sort((a,b)=>companionIds.indexOf(a.id)-companionIds.indexOf(b.id));

  const mapCard = (p: (typeof relatedRaw)[number]) => ({ ...p, variants: p.variants.map(v=>({ price:v.price.toNumber(), stock:v.stock, salePrice:v.salePrice?.toNumber() ?? null, saleActive:isSaleActive(v) })) });
  const variants = product.variants.map((v) => ({ id:v.id, sku:v.sku, price:v.price.toNumber(), salePrice:v.salePrice?.toNumber() ?? null, saleActive:isSaleActive(v), stock:v.stock, optionValueIds:v.optionValues.map((ov)=>ov.optionValueId) }));
  const name = localized(locale, product.nameEn, product.nameAr);
  const description = localized(locale, product.descriptionEn ?? "", product.descriptionAr ?? "");
  const structured = serializeProduct(product, locale);
  const outOfStock = !product.variants.some((v)=>v.stock>0);

  return (
    <div className="store-container pb-16 pt-6 sm:pb-24 sm:pt-8">
      {structured ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} /> : null}
      <nav className="mb-7 flex min-w-0 items-center gap-3 text-xs text-steel sm:mb-10">
        <Link href="/" className="shrink-0 transition-colors hover:text-accent">{storefront("shop")}</Link>
        <svg aria-hidden="true" className="shrink-0 rtl:rotate-180" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 6 6 6-6 6" /></svg>
        <span aria-current="page" className="truncate text-ink">{name}</span>
      </nav>
      <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="lg:sticky lg:top-32"><ProductGallery images={product.images} productName={name} /></div>
        <div className="surface-card p-6 sm:p-8 lg:p-9">
          {product.brand && <p className="eyebrow">{product.brand.name}</p>}
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-4xl">{name}</h1>
            <WishlistButton productId={product.id} initialSaved={!!existingWishlist}/>
          </div>
          {reviews.total > 0 && <p className="mt-4 text-xs font-medium text-steel">{t("reviewSummary",{average:reviews.average.toFixed(1),count:reviews.total})}</p>}
          {description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-steel">{description}</p>}
          <div className="mt-7"><VariantSelector options={product.options} variants={variants} locale={locale}/></div>
          <div className="mt-6 border-t border-line pt-2"><ProductEngagement productId={product.id} signedIn={!!session?.user} outOfStock={outOfStock}/></div>
        </div>
      </div>

      {product.specifications.length ? (
        <section className="mt-16 sm:mt-20">
          <p className="eyebrow">{storefront("details")}</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{storefront("specifications")}</h2>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {product.specifications.map((specification) => (
              <div key={specification.id} className="grid grid-cols-2 gap-4 bg-surface px-6 py-5 text-sm sm:px-8">
                <dt className="text-steel">{localized(locale,specification.keyEn,specification.keyAr)}</dt>
                <dd className="font-medium text-ink">{localized(locale,specification.valueEn,specification.valueAr)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {bundleRows.length ? (
        <section className="mt-16 sm:mt-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{storefront("bundleDeals")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {bundleRows.map(({bundle}) => (
              <div key={bundle.id} className="rounded-3xl border border-accent/15 bg-mist p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-ink">{localized(locale,bundle.nameEn,bundle.nameAr)}</h3>
                  <span className="rounded-full bg-primary-main px-3 py-1.5 text-xs font-medium text-white">{storefront("discount", { value: bundle.discountType === "PERCENTAGE" ? `${bundle.discountValue.toString()}%` : `EGP ${bundle.discountValue.toString()}` })}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-steel">{bundle.items.map(i=>`${i.quantity}× ${localized(locale,i.product.nameEn,i.product.nameAr)}`).join(" + ")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {companions.length ? <section className="mt-16 sm:mt-20"><h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{storefront("boughtTogether")}</h2><div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">{companions.map(p=><ProductCard key={p.id} product={mapCard(p)} locale={locale}/>)}</div></section>:null}
      {relatedRaw.length ? <section className="mt-16 sm:mt-20"><div className="flex flex-wrap items-end justify-between gap-4"><h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{storefront("relatedProducts")}</h2><Link href="/" className="text-sm font-medium text-accent transition-colors hover:text-ink">{storefront("shopAll")} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span></Link></div><div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">{relatedRaw.map(p=><ProductCard key={p.id} product={mapCard(p)} locale={locale}/>)}</div></section>:null}
      <ReviewsSection reviews={reviews}/>
    </div>
  );
}

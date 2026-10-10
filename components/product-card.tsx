import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";
import styles from "./product-card.module.css";

type ProductCardProps = {
  product: {
    id: string;
    nameEn: string;
    nameAr: string;
    slug: string;
    images: { url: string; alt: string | null }[];
    brand: { name: string } | null;
    variants: { price: number; stock: number; salePrice?: number | null; saleActive?: boolean }[];
  };
  locale: AppLocale;
};

export async function ProductCard({ product, locale }: ProductCardProps) {
  const t = await getTranslations("ProductCard");
  const storefront = await getTranslations("Storefront");
  const name = localized(locale, product.nameEn, product.nameAr);
  const image = product.images[0];
  const variant = product.variants[0];
  const outOfStock = !variant || variant.stock === 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className={`group ${styles.card}`}
    >
      <div className={styles.imageWell}>
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? name}
            fill
            className="object-contain p-5 transition-transform duration-500 group-hover:scale-105 sm:p-7 motion-reduce:transform-none"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-steel">{t("noImage")}</div>
        )}
        {outOfStock && (
          <span className="absolute start-3 top-3 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-steel">
            {t("outOfStock")}
          </span>
        )}
        {!outOfStock && variant?.saleActive && variant.salePrice ? (
          <span className={`${styles.saleBadge} absolute start-3 top-3 rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-wide text-white`}>
            {storefront("sale")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-2 pb-3 pt-4 sm:px-3 sm:pb-4">
        {product.brand && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-steel">{product.brand.name}</p>
        )}
        <h3 className="mt-2 line-clamp-2 min-h-11 font-display text-sm font-semibold leading-snug text-ink sm:text-base">{name}</h3>
        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-bold tracking-tight text-ink sm:text-base">
              {variant ? `EGP ${(variant.saleActive && variant.salePrice ? variant.salePrice : variant.price).toLocaleString()}` : "—"}
            </p>
            {variant?.saleActive && variant.salePrice ? <span className="text-[11px] text-steel line-through">{variant.price.toLocaleString()}</span> : null}
          </div>
          <span aria-hidden="true" className={`${styles.arrow} flex size-8 shrink-0 items-center justify-center rounded-full`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="rtl:rotate-180"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

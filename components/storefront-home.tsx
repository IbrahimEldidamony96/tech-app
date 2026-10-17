import type { ComponentProps } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StaticShowcase } from "@/components/static-showcase";
import { ProductCard } from "@/components/product-card";
import { HeroSlider, type SlideItem } from "@/components/hero-slider";
import { StorefrontIcon, categoryIcon } from "@/components/storefront-icon";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";
import styles from "./storefront-home.module.css";

type Props = {
  products: ComponentProps<typeof ProductCard>["product"][];
  categories: { id: string; slug: string; nameEn: string; nameAr: string; parentId: string | null }[];
  slides: SlideItem[];
  locale: AppLocale;
  search?: string;
  activeCategory?: string;
  page: number;
  total: number;
  totalPages: number;
};

export async function StorefrontHome({ products, categories, slides, locale, search, activeCategory, page, total, totalPages }: Props) {
  const t = await getTranslations("Storefront");
  const tHome = await getTranslations("HomePage");
  const isLanding = !search && !activeCategory && page === 1;
  const category = categories.find((item) => item.slug === activeCategory);
  const subcategories = categories.filter((item) => item.parentId !== null);
  const featuredCategories = subcategories.length ? subcategories : categories;

  function href(overrides: { category?: string; page?: number; search?: string }) {
    const params = new URLSearchParams();
    const nextCategory = "category" in overrides ? overrides.category : activeCategory;
    const nextSearch = "search" in overrides ? overrides.search : search;
    if (nextCategory) params.set("category", nextCategory);
    if (nextSearch) params.set("search", nextSearch);
    if (overrides.page && overrides.page > 1) params.set("page", String(overrides.page));
    return `/${params.size ? `?${params}` : ""}#collection`;
  }

  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((number) => number > 0 && number <= totalPages)
    .sort((a, b) => a - b);

  return (
    <div className={`${styles.home} store-container pb-16 pt-5 sm:pb-24 sm:pt-7`}>
      {isLanding && (
        <>
          <section className={`${styles.heroPanel} grid lg:grid-cols-[.86fr_1.14fr]`} aria-labelledby="hero-heading">
            <div className={`${styles.heroCopy} relative z-10 flex flex-col justify-center px-7 py-12 sm:px-12 sm:py-16 lg:py-20`}>
              <p className={`${styles.heroEyebrow} eyebrow flex items-center gap-2.5`}><span className="h-1.5 w-1.5 rounded-full bg-signal" />{t("heroEyebrow")}</p>
              <h1 id="hero-heading" className="mt-6 max-w-[620px] font-display text-[clamp(52px,6vw,88px)] font-normal leading-[.92] tracking-[-0.055em] text-ink">
                {t("heroTitle")}<br /><span className={`${styles.heroAccent} italic font-normal tracking-[-0.05em]`}>{t("heroTitleAccent")}</span>
              </h1>
              <p className="mt-7 max-w-md text-sm leading-7 text-steel sm:text-[15px]">{t("heroDescription")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href="#collection" className="button-primary">{t("shopAll")}<StorefrontIcon name="arrow" width="17" height="17" className="rtl:rotate-180" /></Link>
                <Link href="/wishlist" className={`${styles.secondaryLink} inline-flex min-h-11 items-center gap-2 text-xs font-medium text-steel`}>{t("heroSecondary")}<StorefrontIcon name="arrow" width="15" height="15" className="rtl:rotate-180" /></Link>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <StaticShowcase
                caption={t("heroArtLabel")}
                detail={t("heroArtDetail")}
                imageAlt={t("heroImageAlt")}
                note={t("heroArtNote")}
                status={t("heroVisualStatus")}
              />
            </div>
          </section>

          <div className={`${styles.benefits} grid gap-6 sm:grid-cols-3 sm:gap-5`}>
            {([ ["sliders", "benefitChoice", "benefitChoiceDescription"], ["compare", "benefitCompare", "benefitCompareDescription"], ["shield", "benefitCheckout", "benefitCheckoutDescription"] ] as const).map(([icon, title, description]) => (
              <div key={title} className="flex items-center gap-4">
                <span className={`${styles.benefitIcon} flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent`}><StorefrontIcon name={icon} width="20" height="20" /></span>
                <div><h2 className="text-xs font-semibold text-ink">{t(title)}</h2><p className="mt-1.5 text-[11px] leading-5 text-steel">{t(description)}</p></div>
              </div>
            ))}
          </div>

          {slides.length > 0 && <section className="mt-10" aria-label={t("collection")}><HeroSlider slides={slides} /></section>}

          {categories.length > 0 && (
            <section className={`${styles.categorySection} pt-14 sm:pt-20`} aria-labelledby="category-heading">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-3">{t("categoryEyebrow")}</p><h2 id="category-heading" className="font-display text-3xl font-normal tracking-[-0.04em] sm:text-[42px]">{t("chooseCategory")}</h2></div><p className="text-xs text-steel">{t("categoryDescription")}</p></div>
              <div className={`grid gap-3 sm:gap-4 ${featuredCategories.length === 1 ? "sm:grid-cols-1" : featuredCategories.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                {featuredCategories.map((item) => (
                  <Link key={item.id} href={href({ category: item.slug })} className={`${styles.categoryCard} group flex items-center gap-4 rounded-[22px] px-5 py-5 sm:py-7`}>
                    <span className={`${styles.categoryIcon} flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-accent`}><StorefrontIcon name={categoryIcon(item.slug)} width="28" height="28" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-display text-base font-medium tracking-tight">{localized(locale, item.nameEn, item.nameAr)}</span><span className="mt-1.5 block text-[11px] text-steel">{t("browseCollection")}</span></span>
                    <StorefrontIcon name="arrow" width="18" height="18" className="shrink-0 text-steel transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section id="collection" className={`${styles.collection} ${isLanding ? "pt-16 sm:pt-24" : "pt-5 sm:pt-8"}`} aria-labelledby="collection-heading">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow mb-3">{t("collectionEyebrow")}</p><h2 id="collection-heading" className="font-display text-4xl font-normal tracking-[-0.045em] sm:text-[56px]">{search ? tHome("searchResultsFor", { query: search }) : category ? localized(locale, category.nameEn, category.nameAr) : t("collectionTitle")}</h2><p className="mt-3 text-xs leading-6 text-steel">{t("collectionDescription")}</p></div>
          <p className={`${styles.resultCount} text-xs text-steel`}>{t("resultCount", { count: total })}</p>
        </div>
        <nav className="mb-7 flex flex-wrap items-center gap-2" aria-label={t("collection")}>
          <Link href={href({ category: undefined })} className="collection-chip" aria-current={!activeCategory ? "true" : undefined}><StorefrontIcon name="grid" width="14" height="14" />{t("allProducts")}</Link>
          {categories.map((item) => <Link key={item.id} href={href({ category: item.slug })} className="collection-chip" aria-current={activeCategory === item.slug ? "true" : undefined}>{localized(locale, item.nameEn, item.nameAr)}</Link>)}
          {search && <Link href={href({ search: undefined })} className="ms-auto inline-flex min-h-11 items-center text-xs text-accent underline underline-offset-4">{tHome("clearSearch")}</Link>}
        </nav>

        {products.length === 0 ? (
          <div className="surface-card flex min-h-72 flex-col items-center justify-center text-center">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-mist text-accent"><StorefrontIcon name="bag" /></span>
            <h3 className="font-display text-xl tracking-tight">{t("emptyTitle")}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-steel">{t("emptyDescription")}</p><Link href="/#collection" className="button-primary mt-6">{t("clearFilters")}</Link>
          </div>
        ) : <div className={`${styles.productGrid} grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4`}>{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>}

        {totalPages > 1 && <nav className="mt-10 flex items-center justify-center gap-2" aria-label={t("pagination")}>
          {page > 1 && <Link href={href({ page: page - 1 })} className="icon-button border border-line" aria-label={t("previous")}><StorefrontIcon name="arrow" width="16" height="16" className="rotate-180 rtl:rotate-0" /></Link>}
          {pageNumbers.map((number, index) => <span key={number} className="flex items-center gap-2">{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="px-1 text-steel">…</span>}<Link href={href({ page: number })} aria-label={t("pageLabel", { number })} aria-current={number === page ? "page" : undefined} className="pagination-link flex h-11 w-11 items-center justify-center rounded-full border border-line text-xs transition-colors hover:border-accent">{number}</Link></span>)}
          {page < totalPages && <Link href={href({ page: page + 1 })} className="icon-button border border-line" aria-label={t("next")}><StorefrontIcon name="arrow" width="16" height="16" className="rtl:rotate-180" /></Link>}
        </nav>}
      </section>

      {isLanding && <section className={`${styles.promo} relative mt-16 overflow-hidden rounded-[34px] px-7 py-11 text-white sm:mt-24 sm:px-14 sm:py-16`}>
        <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 h-96 w-96 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -end-9 -top-10 h-64 w-64 rounded-full border border-white/10" />
        <div className={`${styles.promoLayout} relative grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16`}>
          <div><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-promo-muted">{t("promoEyebrow")}</p><h2 className="mt-5 max-w-lg font-display text-4xl font-normal leading-[1.02] tracking-[-0.04em] sm:text-5xl">{t("promoTitle")}</h2><p className="mt-5 max-w-lg text-xs leading-6 text-promo-copy">{t("promoDescription")}</p><Link href="#collection" className={`${styles.promoLink} mt-8 inline-flex min-h-12 items-center gap-3 rounded-full px-6 py-3 text-xs font-semibold text-art-ink`}>{t("promoLink")}<StorefrontIcon name="arrow" width="17" height="17" className="rtl:rotate-180" /></Link></div>
          <div className={styles.standardList}>
            {(["standardWarranty", "standardDelivery", "standardPayment"] as const).map((key, index) => (
              <div className={styles.standardItem} key={key}><span>0{index + 1}</span><div><h3>{t(`${key}Title`)}</h3><p>{t(`${key}Description`)}</p></div></div>
            ))}
          </div>
        </div>
      </section>}
    </div>
  );
}

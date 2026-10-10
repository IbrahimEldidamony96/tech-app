import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StorefrontIcon } from "@/components/storefront-icon";
import styles from "./chrome.module.css";

export async function Footer() {
  const t = await getTranslations("Storefront");
  return (
    <footer className={`${styles.footer} border-t border-line`}>
      <div className="store-container">
        <div className="grid gap-10 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:gap-8 sm:py-16">
          <div>
            <Link href="/" dir="ltr" className={`${styles.wordmark} inline-block font-display text-xl font-bold tracking-tight`}>TECH<span className="text-accent">/</span>STORE<span className="text-accent">.</span></Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-steel">{t("footerDescription")}</p>
            <p className={`${styles.secureCheckout} mt-6 flex items-center gap-2 text-xs text-accent`}><StorefrontIcon name="shield" width="16" height="16" />{t("secureCheckout")}</p>
          </div>
          <nav aria-label={t("footerExplore")}>
            <h2 className="eyebrow mb-5">{t("footerExplore")}</h2>
            <ul className="space-y-3 text-sm">
              <li><Link className={`${styles.footerLink} footer-link`} href="/#collection">{t("collection")}</Link></li>
              <li><Link className={`${styles.footerLink} footer-link`} href="/compare">{t("compare")}</Link></li>
              <li><Link className={`${styles.footerLink} footer-link`} href="/wishlist">{t("footerWishlist")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("footerAccount")}>
            <h2 className="eyebrow mb-5">{t("footerAccount")}</h2>
            <ul className="space-y-3 text-sm">
              <li><Link className={`${styles.footerLink} footer-link`} href="/account">{t("account")}</Link></li>
              <li><Link className={`${styles.footerLink} footer-link`} href="/orders">{t("footerOrders")}</Link></li>
              <li><Link className={`${styles.footerLink} footer-link`} href="/cart">{t("yourBag")}</Link></li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-6 text-[11px] leading-6 text-steel">
          <p>{t("footerCopyright", { year: new Date().getFullYear() })}</p>
          <p className={styles.paymentNote}>{t("footerPayment")}</p>
        </div>
      </div>
    </footer>
  );
}

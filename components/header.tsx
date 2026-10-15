import { Suspense } from "react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { HeaderMenu } from "@/components/header-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { isStaffRole } from "@/lib/permissions";
import styles from "./chrome.module.css";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4 rtl:rotate-180">
      <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
      <path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 7l-1.4-1.4a5 5 0 0 0-7 7L12 21l8.4-8.4a5 5 0 0 0 0-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
      <path d="M5 8h14l1 13H4L5 8Z" strokeLinejoin="round" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" strokeLinecap="round" />
    </svg>
  );
}

export async function Header() {
  const [session, t, store, locale] = await Promise.all([
    auth(),
    getTranslations("Header"),
    getTranslations("Storefront"),
    getLocale(),
  ]);
  const staff = session?.user && isStaffRole(session.user.role);
  const navigationClass = styles.navigationLink;
  const menuLinkClass = "rounded-xl px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-mist";
  const signOutAction = async () => {
    "use server";
    await signOut();
  };

  return (
    <header className={`${styles.header} relative z-40`}>
      <div className={styles.topStrip}>
        <div className="store-container flex min-h-9 items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[10px] tracking-wide sm:text-[11px]">
            <span className="size-1.5 shrink-0 rounded-full bg-signal" />
            {store("tagline")}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <LocaleSwitcher locale={locale as "en" | "ar"} />
          </div>
        </div>
      </div>

      <div className={`${styles.mainRow} store-container flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-3 lg:gap-x-8`}>
        <Link href="/" aria-label="Tech Store" className="group flex shrink-0 items-center gap-3">
          <span className={`${styles.logoMark} hidden size-10 items-center justify-center rounded-xl text-white sm:flex`}>
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
              <path d="m4 9 14-6 10 5-14 6Z" fill="#79aaff" />
              <path d="m4 9 10 5v15L4 23Z" fill="#ffffff" />
              <path d="m14 14 14-6v15l-14 6Z" fill="#efa634" />
            </svg>
          </span>
          <span dir="ltr" className={`${styles.wordmark} font-body text-xl font-bold tracking-[-0.04em] text-ink sm:text-[23px]`}>
            Tech Store
          </span>
        </Link>

        <Suspense fallback={<div className="order-3 h-12 w-full rounded-full bg-paper md:order-none md:w-auto md:flex-1" />}>
          <SearchBar className="order-3 w-full md:order-none md:w-auto md:flex-1" />
        </Suspense>

        <nav aria-label={store("account")} className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link href="/wishlist" title={t("wishlist")} aria-label={t("wishlist")} className="icon-button hidden md:flex">
            <HeartIcon />
          </Link>
          <Link href={session?.user ? "/account" : "/login"} title={session?.user?.name || store("account")} aria-label={session?.user ? store("account") : t("signIn")} className="icon-button hidden md:flex">
            <UserIcon />
          </Link>
          <span className="mx-1 hidden h-6 w-px bg-line md:block" />
          <Link href="/cart" title={t("cart")} aria-label={t("cart")} className="icon-button bg-mist text-accent">
            <BagIcon />
          </Link>
          <HeaderMenu>
            <Link href="/#collection" className={menuLinkClass}>{store("shopAll")}</Link>
            <Link href="/wishlist" className={menuLinkClass}>{t("wishlist")}</Link>
            <Link href="/compare" className={menuLinkClass}>{store("compare")}</Link>
            {session?.user ? (
              <>
                <Link href="/account" className={`${menuLinkClass} break-words`}>{session.user.name || store("account")}</Link>
                <Link href="/orders" className={menuLinkClass}>{t("orders")}</Link>
                <Link href="/account/notifications" className={menuLinkClass}>{store("notifications")}</Link>
                {staff && <Link href="/admin" className={menuLinkClass}>{t("admin")}</Link>}
                <form action={signOutAction} className="mt-2 border-t border-line pt-2">
                  <button type="submit" className={`${menuLinkClass} w-full text-start text-steel`}>{t("signOut")}</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="button-primary mt-2">{t("signIn")}</Link>
            )}
          </HeaderMenu>
        </nav>
      </div>

      <div className={`${styles.navigationRow} hidden md:block`}>
        <div className="store-container flex min-h-12 items-center justify-between gap-6 text-xs font-medium text-steel">
          <nav aria-label={store("navigation")} className="flex flex-wrap items-center gap-x-7 gap-y-2 py-3">
            <Link href="/#collection" className={`${navigationClass} flex items-center gap-2 font-semibold text-accent`}>{store("shopAll")}<ArrowIcon /></Link>
            <Link href="/wishlist" className={navigationClass}>{t("wishlist")}</Link>
            <Link href="/compare" className={navigationClass}>{store("compare")}</Link>
            {session?.user && <Link href="/orders" className={navigationClass}>{t("orders")}</Link>}
            {staff && <Link href="/admin" className={navigationClass}>{t("admin")}</Link>}
          </nav>
          <div className="flex shrink-0 items-center gap-5">
            {session?.user ? (
              <>
                <Link href="/account/notifications" className="icon-button" title={store("notifications")} aria-label={store("notifications")}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <form action={signOutAction}><button type="submit" className={navigationClass}>{t("signOut")}</button></form>
              </>
            ) : (
              <Link href="/login" className={navigationClass}>{t("signIn")}</Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

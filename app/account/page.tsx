import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";
import { AddressManager } from "@/components/account/address-manager";
import { EmailVerificationBanner } from "@/components/account/email-verification-banner";
import Link from "next/link";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/account");

  const [user, addresses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, image: true, password: true, emailVerified: true },
    }),
    prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!user) redirect("/login?next=/account");

  const t = await getTranslations("Account");
  const store = await getTranslations("Storefront");

  return (
    <div className="page-shell space-y-7">
      <div className="mb-9">
        <p className="eyebrow">{store("account")}</p>
        <h1 className="page-heading mt-3">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-steel">{store("accountDescription")}</p>
      </div>

      {!user.emailVerified && <EmailVerificationBanner />}

      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Shopping & rewards</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["/account/notifications", "Notifications", "Order, shipment, stock and promotion updates"],
            ["/account/loyalty", "Loyalty points", "Balance and points history"],
            ["/account/referrals", "Referrals", "Invite friends and earn rewards"],
            ["/account/returns", "Returns & refunds", "Create and track return requests"],
            ["/account/recently-viewed", "Recently viewed", "Continue browsing products you opened"],
            ["/compare", "Compare products", "Compare saved products and specifications"],
          ].map(([href, title, desc]) => (
            <Link key={href} href={href} className="group rounded-2xl border border-line bg-paper/50 p-5 transition-colors hover:border-accent/30 hover:bg-mist">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{title}</p>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-steel transition-transform group-hover:translate-x-0.5 rtl:rotate-180"><path d="m9 5 7 7-7 7" /></svg>
              </div>
              <p className="mt-2 text-xs leading-5 text-steel">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          {t("profile")}
        </h2>
        <div className="mt-5 max-w-2xl">
          <ProfileForm initialName={user.name} initialImage={user.image} />
        </div>
      </section>

      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          {t("password")}
        </h2>
        <div className="mt-5 max-w-2xl">
          <PasswordForm hasPassword={!!user.password} />
        </div>
      </section>

      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          {t("addresses")}
        </h2>
        <div className="mt-5 max-w-3xl">
          <AddressManager initialAddresses={addresses} />
        </div>
      </section>
    </div>
  );
}

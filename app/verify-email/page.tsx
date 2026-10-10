import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations("Auth");
  const { status } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center sm:px-6">
      {status === "success" ? (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">{t("emailVerifiedHeading")}</h1>
          <p className="mt-3 text-sm text-steel">{t("emailVerifiedSubheading")}</p>
        </>
      ) : status === "invalid" ? (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">{t("verificationLinkInvalid")}</h1>
          <p className="mt-3 text-sm text-steel">{t("verificationLinkInvalidSubheading")}</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">{t("checkYourEmail")}</h1>
          <p className="mt-3 text-sm text-steel">{t("verifyEmailPrompt")}</p>
        </>
      )}
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-ink hover:underline">
        {t("backToHome")}
      </Link>
    </div>
  );
}

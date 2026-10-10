import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { getAllReviewsForAdmin } from "@/lib/queries/admin-reviews";
import { localized } from "@/lib/locale";
import { DeleteReviewButton } from "@/components/admin/delete-review-button";
import type { AppLocale } from "@/i18n/request";

export default async function AdminReviewsPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "orders:read")) redirect("/");

  const reviews = await getAllReviewsForAdmin();
  const t = await getTranslations("AdminReviews");
  const locale = (await getLocale()) as AppLocale;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1>

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-steel">{t("noReviews")}</p>
      ) : (
        <ul className="mt-6 divide-y divide-steel/10">
          {reviews.map((review) => (
            <li key={review.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/products/${review.product.slug}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {localized(locale, review.product.nameEn, review.product.nameAr)}
                  </Link>
                  <p className="mt-0.5 text-xs text-steel">
                    {review.user.name} · {review.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-ink">★ {review.rating}</span>
                  <span className="font-mono text-xs text-steel">
                    {review.createdAt.toLocaleDateString()}
                  </span>
                  <DeleteReviewButton reviewId={review.id} />
                </div>
              </div>
              <p className="mt-2 text-sm text-steel">
                {review.comment || t("noComment")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

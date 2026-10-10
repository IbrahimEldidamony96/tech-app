import { getTranslations } from "next-intl/server";

type ReviewsData = {
  items: { id: string; rating: number; comment: string | null; user: { name: string } }[];
  total: number;
  average: number;
  breakdown: Record<number, number>;
};

export async function ReviewsSection({ reviews }: { reviews: ReviewsData }) {
  const t = await getTranslations("Reviews");

  return (
    <section className="mt-16 border-t border-line pt-10 sm:mt-20 sm:pt-12">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t("title")}</h2>

      {reviews.total === 0 ? (
        <p className="surface-card mt-6 px-6 py-8 text-sm text-steel">{t("empty")}</p>
      ) : (
        <>
          <div className="surface-card mt-6 flex max-w-xl items-center gap-6 p-6 sm:gap-10 sm:p-8">
            <div className="shrink-0 text-center">
              <p className="font-display text-5xl font-semibold tracking-tight text-ink">{reviews.average.toFixed(1)}</p>
              <p aria-hidden="true" className="mt-2 text-sm tracking-[0.12em] text-accent">{"★".repeat(Math.round(reviews.average))}<span className="text-line">{"★".repeat(5 - Math.round(reviews.average))}</span></p>
            </div>
            <div className="flex-1 space-y-2.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.breakdown[star] ?? 0;
                const pct = reviews.total ? (count / reviews.total) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3 text-xs text-steel">
                    <span className="w-3 tabular-nums">{star}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-end tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {reviews.items.map((review) => (
              <li key={review.id} className="surface-card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-mist text-sm font-semibold text-accent">{review.user.name.slice(0, 1)}</span>
                    <p className="text-sm font-semibold text-ink">{review.user.name}</p>
                  </div>
                  <p className="rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-accent">★ {review.rating}</p>
                </div>
                {review.comment && <p className="mt-4 text-sm leading-7 text-steel">{review.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

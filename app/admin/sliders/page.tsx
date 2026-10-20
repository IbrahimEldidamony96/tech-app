import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { getTranslations } from "next-intl/server";
import { getAllSlidersForAdmin } from "@/lib/queries/sliders";
import { SlidersManager } from "@/components/admin/sliders-manager";

export default async function AdminSlidersPage() {
  const guardedUser = await requireAdminPagePermission("marketing:read");

  const slides = await getAllSlidersForAdmin();
  const t = await getTranslations("AdminSliders");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-steel">
        {t("description")}
      </p>

      <div className="mt-6">
        <SlidersManager initialSlides={slides} />
      </div>
    </div>
  );
}

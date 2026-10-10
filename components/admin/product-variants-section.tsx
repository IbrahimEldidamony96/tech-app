"use client";

import { useState } from "react";
import { OptionsManager, type OptionWithValues } from "./options-manager";
import { VariantsManager, type VariantWithSummary } from "./variants-manager";
import type { AppLocale } from "@/i18n/request";

export function ProductVariantsSection({
  productId,
  initialOptions,
  initialVariants,
  locale,
}: {
  productId: string;
  initialOptions: OptionWithValues[];
  initialVariants: VariantWithSummary[];
  locale: AppLocale;
}) {
  // الـ state هنا مشترك بين الاتنين — لو ضفت Option جديد في OptionsManager،
  // VariantsManager يشوفه على طول في قائمة الاختيار من غير أي refresh
  const [options, setOptions] = useState(initialOptions);
  const [variants, setVariants] = useState(initialVariants);

  return (
    <>
      <OptionsManager productId={productId} options={options} setOptions={setOptions} />
      <VariantsManager
        productId={productId}
        options={options}
        variants={variants}
        setVariants={setVariants}
        locale={locale}
      />
    </>
  );
}

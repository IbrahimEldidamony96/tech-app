import type { AppLocale } from "@/i18n/request";

// كل الموديلات في الـ schema بتخزن الحقل مرتين: xEn و xAr. الدالة دي
// بتختار النسخة الصح على حسب اللغة الحالية، وده بديل بسيط لتكرار
// `locale === "ar" ? product.nameAr : product.nameEn` في كل component.
export function localized(locale: AppLocale, en: string, ar: string): string {
  return locale === "ar" ? ar : en;
}

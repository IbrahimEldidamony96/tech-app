import { prisma } from "@/lib/prisma";
import { getBostaCities } from "@/lib/bosta";

export type AdminShippingRateRow = {
  bostaCityId: string;
  cityNameEn: string;
  cityNameAr: string | null;
  /** null = admin hasn't configured this governorate yet (checkout falls
   * back to DEFAULT_SHIPPING_FEE for it) */
  rateId: string | null;
  fee: number | null;
  isActive: boolean;
};

// بنجيب كل محافظات Bosta الحقيقية (live, من /cities) وندمجها مع أي
// أسعار محفوظة عندنا (ShippingRate) — عشان الأدمن يشوف كل محافظة
// Bosta بتشحن لها فعليًا، حتى اللي لسه معملهاش سعر ليها، بدل ما يعتمد
// بس على اللي اتسجل عندنا قبل كده.
export async function getShippingRatesForAdmin(): Promise<
  AdminShippingRateRow[]
> {
  const [cities, rates] = await Promise.all([
    getBostaCities(),
    prisma.shippingRate.findMany(),
  ]);

  const ratesByCity = new Map(rates.map((r) => [r.bostaCityId, r]));

  return cities
    .map((city) => {
      const rate = ratesByCity.get(city._id);
      return {
        bostaCityId: city._id,
        cityNameEn: city.name,
        cityNameAr: city.nameAr ?? null,
        rateId: rate?.id ?? null,
        fee: rate ? rate.fee.toNumber() : null,
        isActive: rate?.isActive ?? true,
      };
    })
    .sort((a, b) => a.cityNameEn.localeCompare(b.cityNameEn));
}

import type { AddressInput } from "@/lib/validations/address";
import { resolveBostaCityIdCached, resolveBostaDistrictIdCached } from "@/lib/bosta";
export async function validateAddressLocation(address: AddressInput) {
  // Legacy name-only records remain editable; any supplied IDs must agree
  // with the selected governorate and zone.
  if (!address.bostaCityId && !address.bostaDistrictId) return;
  const cityId = await resolveBostaCityIdCached(address.bostaCityId, address.governorate);
  await resolveBostaDistrictIdCached(address.bostaDistrictId, cityId, address.city);
}

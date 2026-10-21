export type StorePaymentMethod = "CASH_ON_DELIVERY" | "CARD" | "WALLET";

export function availablePaymentMethods(env: Readonly<Record<string, string | undefined>> = process.env): StorePaymentMethod[] {
  const methods: StorePaymentMethod[] = ["CASH_ON_DELIVERY"];
  if (!env.PAYMOB_SECRET_KEY || !env.PAYMOB_PUBLIC_KEY || !env.PAYMOB_HMAC_SECRET || !env.PAYMOB_API_KEY) return methods;
  if (/^[1-9]\d*$/.test(env.PAYMOB_INTEGRATION_ID_CARD ?? "")) methods.push("CARD");
  if (/^[1-9]\d*$/.test(env.PAYMOB_INTEGRATION_ID_WALLET ?? "")) methods.push("WALLET");
  return methods;
}

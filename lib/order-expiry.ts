type UnpaidOrderSnapshot = {
  status: string;
  paymentStatus: string;
  createdAt: Date;
  payment: { method: string; status: string } | null;
};

export const DEFAULT_EXPIRY_MINUTES = 60;

export function expiryMinutesFromEnv(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_EXPIRY_MINUTES;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 15 || n > 24 * 60) {
    throw new Error("UNPAID_ORDER_EXPIRY_MINUTES must be an integer from 15 to 1440");
  }
  return n;
}

export function isExpiredUnpaidOnlineOrder(order: UnpaidOrderSnapshot, cutoff: Date): boolean {
  return order.status === "PENDING" &&
    order.paymentStatus === "PENDING" &&
    order.createdAt.getTime() < cutoff.getTime() &&
    order.payment !== null &&
    order.payment.method !== "CASH_ON_DELIVERY" &&
    order.payment.status === "PENDING";
}

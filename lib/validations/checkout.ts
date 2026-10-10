import { z } from "zod";

export const checkoutSchema = z.object({
  addressId: z.string().min(1),
  couponCode: z.string().trim().min(1).max(50).transform((v) => v.toUpperCase()).optional(),
  paymentMethod: z.enum(["CASH_ON_DELIVERY", "CARD", "WALLET"]).default("CASH_ON_DELIVERY"),
  customerNote: z.string().trim().max(500).optional(),
  loyaltyPointsToRedeem: z.coerce.number().int().min(0).max(100000).default(0),
  checkoutKey: z.string().uuid().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

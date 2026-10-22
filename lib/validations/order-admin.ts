import { z } from "zod";

export const updateShipmentSchema = z.object({
  status: z.enum(["PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED", "AWAITING_RECEIPT"]),
  receiptConfirmed: z.boolean().optional(),
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  shippingMethod: z.string().min(1).max(100).optional(),
}).refine(value => value.status !== "RETURNED" || value.receiptConfirmed === true, {
  path: ["receiptConfirmed"], message: "Confirm the returned goods were physically received, inspected, and are sellable before restocking",
});
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

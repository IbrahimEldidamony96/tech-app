import { z } from "zod";

export const updateShipmentSchema = z.object({
  status: z.enum(["PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"]),
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  shippingMethod: z.string().min(1).max(100).optional(),
});
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

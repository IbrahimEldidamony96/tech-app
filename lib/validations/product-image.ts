import { z } from "zod";

// Only `url` is required on create — the Cloudinary upload (file or pasted
// URL) already happened client-side via ImageUploader, so by the time this
// hits the API the image is already hosted and we're just recording it
// against the product. `isPrimary`/`sortOrder` are never accepted from the
// client on create — the server decides them (see the POST handler).
export const productImageCreateSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200).optional(),
});
export type ProductImageCreateInput = z.infer<typeof productImageCreateSchema>;

export const productImageUpdateSchema = z.object({
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type ProductImageUpdateInput = z.infer<typeof productImageUpdateSchema>;

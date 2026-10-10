import { z } from "zod";

// A slide's link can point somewhere internal ("/products/x", "/?category=y")
// or to an external site — anything else is almost certainly a typo, so we
// reject it up front instead of silently saving a dead link.
const linkSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => v.startsWith("/") || /^https?:\/\//i.test(v),
    "Link must start with / (an internal page) or http(s):// (an external site)",
  );

// Accepts "" from the form as shorthand for "no link" — the route handlers
// normalize that to `null` before it hits the database, since `link: null`
// is what the slider component checks to decide whether a slide navigates
// anywhere at all.
const optionalLinkInput = z.union([linkSchema, z.literal("")]).optional();

export const sliderImageCreateSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200).optional(),
  link: optionalLinkInput,
});
export type SliderImageCreateInput = z.infer<typeof sliderImageCreateSchema>;

export const sliderImageUpdateSchema = z.object({
  alt: z.string().max(200).optional(),
  link: optionalLinkInput,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type SliderImageUpdateInput = z.infer<typeof sliderImageUpdateSchema>;

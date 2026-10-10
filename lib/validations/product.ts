import { z } from "zod";

const optionalText = (max: number) => z.string().max(max).optional();

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.enum(["true", "false"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  specification: z.string().max(100).optional(),
  specificationValue: z.string().max(200).optional(),
  sort: z.enum(["newest", "name_asc", "name_desc", "price_asc", "price_desc", "rating_desc"]).default("newest"),
}).superRefine((value, ctx) => {
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    ctx.addIssue({ code: "custom", path: ["minPrice"], message: "minPrice must be <= maxPrice" });
  }
  if (!!value.specification !== !!value.specificationValue) {
    ctx.addIssue({ code: "custom", path: ["specification"], message: "Specification key and value must be provided together" });
  }
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productCreateSchema = z.object({
  nameEn: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/, "slug: حروف إنجليزية صغيرة وأرقام وشرطات فقط"),
  descriptionEn: optionalText(5000),
  descriptionAr: optionalText(5000),
  metaTitleEn: optionalText(200),
  metaTitleAr: optionalText(200),
  metaDescriptionEn: optionalText(500),
  metaDescriptionAr: optionalText(500),
  categoryId: z.string().min(1),
  brandId: z.string().min(1).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = productCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  brandId: z.string().min(1).nullable().optional(),
  metaTitleEn: z.string().max(200).nullable().optional(),
  metaTitleAr: z.string().max(200).nullable().optional(),
  metaDescriptionEn: z.string().max(500).nullable().optional(),
  metaDescriptionAr: z.string().max(500).nullable().optional(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productSpecificationSchema = z.object({
  keyEn: z.string().trim().min(1).max(100),
  keyAr: z.string().trim().min(1).max(100),
  valueEn: z.string().trim().min(1).max(250),
  valueAr: z.string().trim().min(1).max(250),
  isFilterable: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const productSpecificationsReplaceSchema = z.object({
  specifications: z.array(productSpecificationSchema).max(100),
});

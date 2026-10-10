-- Extended commerce features: staff roles, loyalty/referrals, guest checkout,
-- product merchandising, inventory/audit, returns, notifications and bundles.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRODUCT_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ORDER_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('SALE', 'RESTOCK', 'CANCELLATION', 'RETURN', 'ADMIN_ADJUSTMENT');
CREATE TYPE "NotificationType" AS ENUM ('ORDER', 'PAYMENT', 'SHIPMENT', 'STOCK', 'PROMOTION', 'SYSTEM');
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED');
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'ADJUSTMENT', 'REFERRAL');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'STATUS_CHANGE');
CREATE TYPE "BundleDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- User features
ALTER TABLE "User"
  ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product merchandising / SEO / denormalized listing fields
ALTER TABLE "Product"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "startingPrice" DECIMAL(65,30),
  ADD COLUMN "averageRating" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "metaTitleEn" TEXT,
  ADD COLUMN "metaTitleAr" TEXT,
  ADD COLUMN "metaDescriptionEn" TEXT,
  ADD COLUMN "metaDescriptionAr" TEXT;
CREATE INDEX "Product_isActive_deletedAt_idx" ON "Product"("isActive", "deletedAt");
CREATE INDEX "Product_startingPrice_idx" ON "Product"("startingPrice");
CREATE INDEX "Product_averageRating_idx" ON "Product"("averageRating");

ALTER TABLE "ProductVariant"
  ADD COLUMN "salePrice" DECIMAL(65,30),
  ADD COLUMN "saleStartsAt" TIMESTAMP(3),
  ADD COLUMN "saleEndsAt" TIMESTAMP(3);

ALTER TABLE "Cart" ADD COLUMN "abandonedReminderSentAt" TIMESTAMP(3);

-- Advanced coupons
ALTER TABLE "Coupon"
  ADD COLUMN "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "brandId" TEXT;
CREATE INDEX "Coupon_categoryId_idx" ON "Coupon"("categoryId");
CREATE INDEX "Coupon_brandId_idx" ON "Coupon"("brandId");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guest checkout + order timeline metadata
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_userId_fkey";
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Order"
  ADD COLUMN "guestEmail" TEXT,
  ADD COLUMN "guestAccessTokenHash" TEXT,
  ADD COLUMN "checkoutKey" TEXT,
  ADD COLUMN "customerNote" TEXT,
  ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key" ON "Order"("guestAccessTokenHash");
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
CREATE INDEX "Order_guestEmail_idx" ON "Order"("guestEmail");
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product specifications
CREATE TABLE "ProductSpecification" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "keyEn" TEXT NOT NULL,
  "keyAr" TEXT NOT NULL,
  "valueEn" TEXT NOT NULL,
  "valueAr" TEXT NOT NULL,
  "isFilterable" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductSpecification_productId_idx" ON "ProductSpecification"("productId");
CREATE INDEX "ProductSpecification_keyEn_valueEn_idx" ON "ProductSpecification"("keyEn","valueEn");
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Engagement
CREATE TABLE "RecentlyViewed" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecentlyViewed_userId_productId_key" ON "RecentlyViewed"("userId","productId");
CREATE INDEX "RecentlyViewed_userId_viewedAt_idx" ON "RecentlyViewed"("userId","viewedAt");
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StockAlert" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "notifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockAlert_userId_productId_key" ON "StockAlert"("userId","productId");
CREATE INDEX "StockAlert_productId_notifiedAt_idx" ON "StockAlert"("productId","notifiedAt");
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
  "title" TEXT NOT NULL, "message" TEXT NOT NULL, "link" TEXT,
  "readAt" TIMESTAMP(3), "emailSentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId","readAt","createdAt");
CREATE INDEX "Notification_emailSentAt_createdAt_idx" ON "Notification"("emailSentAt","createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "status" "OrderStatus",
  "title" TEXT NOT NULL, "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId","createdAt");
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Returns
CREATE TABLE "ReturnRequest" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL, "customerNote" TEXT, "adminNote" TEXT,
  "refundAmount" DECIMAL(65,30),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnRequest_userId_createdAt_idx" ON "ReturnRequest"("userId","createdAt");
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReturnItem" (
  "id" TEXT NOT NULL, "returnRequestId" TEXT NOT NULL, "orderItemId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Loyalty / inventory / audit
CREATE TABLE "LoyaltyTransaction" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "LoyaltyTransactionType" NOT NULL,
  "points" INTEGER NOT NULL, "balanceAfter" INTEGER NOT NULL,
  "referenceType" TEXT, "referenceId" TEXT, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoyaltyTransaction_userId_createdAt_idx" ON "LoyaltyTransaction"("userId","createdAt");
CREATE INDEX "LoyaltyTransaction_referenceType_referenceId_idx" ON "LoyaltyTransaction"("referenceType","referenceId");
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL, "variantId" TEXT NOT NULL, "type" "InventoryMovementType" NOT NULL,
  "quantityDelta" INTEGER NOT NULL, "stockAfter" INTEGER NOT NULL,
  "referenceType" TEXT, "referenceId" TEXT, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryMovement_variantId_createdAt_idx" ON "InventoryMovement"("variantId","createdAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType","referenceId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL, "actorId" TEXT, "action" "AuditAction" NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT, "summary" TEXT NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId","createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType","entityId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bundles
CREATE TABLE "Bundle" (
  "id" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameAr" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "discountType" "BundleDiscountType" NOT NULL, "discountValue" DECIMAL(65,30) NOT NULL,
  "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bundle_slug_key" ON "Bundle"("slug");
CREATE TABLE "BundleItem" (
  "id" TEXT NOT NULL, "bundleId" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BundleItem_bundleId_productId_key" ON "BundleItem"("bundleId","productId");
CREATE INDEX "BundleItem_productId_idx" ON "BundleItem"("productId");
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill denormalized listing fields for existing catalog data.
UPDATE "Product" p
SET "startingPrice" = v.min_price
FROM (
  SELECT "productId", MIN("price") AS min_price
  FROM "ProductVariant"
  WHERE "isActive" = true
  GROUP BY "productId"
) v
WHERE p."id" = v."productId";

UPDATE "Product" p
SET "averageRating" = r.avg_rating,
    "reviewCount" = r.review_count
FROM (
  SELECT "productId", AVG("rating")::DECIMAL(65,30) AS avg_rating, COUNT(*)::INTEGER AS review_count
  FROM "Review"
  GROUP BY "productId"
) r
WHERE p."id" = r."productId";

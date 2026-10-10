-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "bostaCityId" TEXT,
ADD COLUMN     "bostaDistrictId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingBostaCityId" TEXT,
ADD COLUMN     "shippingBostaDistrictId" TEXT;

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "bostaCityId" TEXT NOT NULL,
    "cityNameEn" TEXT NOT NULL,
    "cityNameAr" TEXT,
    "fee" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_bostaCityId_key" ON "ShippingRate"("bostaCityId");

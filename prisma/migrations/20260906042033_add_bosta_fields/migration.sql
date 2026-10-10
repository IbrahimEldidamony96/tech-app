/*
  Warnings:

  - A unique constraint covering the columns `[bostaDeliveryId]` on the table `Shipment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "bostaDeliveryId" TEXT,
ADD COLUMN     "bostaRawState" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_bostaDeliveryId_key" ON "Shipment"("bostaDeliveryId");

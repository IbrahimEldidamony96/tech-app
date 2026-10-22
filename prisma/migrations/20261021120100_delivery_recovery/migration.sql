ALTER TABLE "Shipment" ADD COLUMN "stockRestoredAt" TIMESTAMP(3);
UPDATE "Shipment" SET "stockRestoredAt" = "updatedAt" WHERE "status" = 'RETURNED';
CREATE TABLE "ShipmentBooking" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTING',
  "requestKey" TEXT NOT NULL,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "bostaDeliveryId" TEXT,
  "trackingNumber" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipmentBooking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShipmentBooking_status_check" CHECK ("status" IN ('REQUESTING', 'UNKNOWN', 'BOOKED', 'FAILED', 'CANCELLED'))
);
CREATE UNIQUE INDEX "ShipmentBooking_orderId_key" ON "ShipmentBooking"("orderId");
CREATE UNIQUE INDEX "ShipmentBooking_requestKey_key" ON "ShipmentBooking"("requestKey");
CREATE TABLE "EmailDelivery" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "claimToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "firstAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'NEEDS_REVIEW'))
);
CREATE INDEX "EmailDelivery_status_leaseUntil_idx" ON "EmailDelivery"("status", "leaseUntil");

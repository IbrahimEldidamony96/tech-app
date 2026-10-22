CREATE TABLE "ShipmentBookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bostaDeliveryId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "rawState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "ShipmentBookingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShipmentBookingEvent_identity_state_key"
ON "ShipmentBookingEvent"("bookingId", "bostaDeliveryId", "trackingNumber", "rawState");

ALTER TABLE "ShipmentBookingEvent" ADD CONSTRAINT "ShipmentBookingEvent_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "ShipmentBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Record money movements separately from order/payment state.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
CREATE TYPE "RefundStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED');

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "amount" DECIMAL(12,2) NOT NULL,
  "providerBaselineCents" INTEGER,
  "providerReference" TEXT,
  "confirmationNote" TEXT,
  "requestedById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_positive_amount" CHECK ("amount" > 0),
  CONSTRAINT "Refund_confirmation_consistency" CHECK (
    ("status" = 'PENDING_CONFIRMATION' AND "confirmedAt" IS NULL)
    OR ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Refund_returnRequestId_key" ON "Refund"("returnRequestId");
CREATE UNIQUE INDEX "Refund_providerReference_key" ON "Refund"("providerReference");
CREATE INDEX "Refund_orderId_status_idx" ON "Refund"("orderId", "status");
CREATE INDEX "Refund_paymentId_status_idx" ON "Refund"("paymentId", "status");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "LoyaltyTransaction_idempotencyKey_key" ON "LoyaltyTransaction"("idempotencyKey");

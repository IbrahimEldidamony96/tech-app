ALTER TABLE "Refund" ALTER COLUMN "returnRequestId" DROP NOT NULL;
ALTER TABLE "Refund" ADD COLUMN "cancellationReason" TEXT;
DROP INDEX "Refund_returnRequestId_key";
CREATE INDEX "Refund_returnRequestId_idx" ON "Refund"("returnRequestId");
CREATE UNIQUE INDEX "Refund_one_active_return" ON "Refund"("returnRequestId")
  WHERE "returnRequestId" IS NOT NULL AND "status" <> 'CANCELLED';
CREATE UNIQUE INDEX "Refund_one_active_order" ON "Refund"("orderId")
  WHERE "returnRequestId" IS NULL AND "status" <> 'CANCELLED';
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_confirmation_consistency";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_confirmation_consistency" CHECK (
  ("status" IN ('PENDING_CONFIRMATION', 'CANCELLED') AND "confirmedAt" IS NULL)
  OR ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL)
);

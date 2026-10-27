-- WhatsApp bot conversation state + payment bookkeeping
ALTER TABLE "Conversation" ADD COLUMN "state" JSONB;

ALTER TABLE "Donation" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Donation" ADD COLUMN "receiptSentAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Donations that were already PAID before this migration have already had their receipt flow run.
UPDATE "Donation" SET "paidAt" = "createdAt", "receiptSentAt" = "createdAt" WHERE "paymentStatus" = 'PAID';
UPDATE "Order" SET "paidAt" = "updatedAt" WHERE "paymentStatus" = 'PAID';

CREATE INDEX "Donation_paymentStatus_createdAt_idx" ON "Donation"("paymentStatus", "createdAt");
CREATE INDEX "Donation_razorpayOrderId_idx" ON "Donation"("razorpayOrderId");
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE INDEX "Order_razorpayOrderId_idx" ON "Order"("razorpayOrderId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

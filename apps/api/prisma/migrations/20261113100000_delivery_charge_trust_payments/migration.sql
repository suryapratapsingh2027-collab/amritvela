-- Delivery charge is set per product by the admin (0 = free delivery).
ALTER TABLE "Product" ADD COLUMN "deliveryCharge" INTEGER NOT NULL DEFAULT 0;

-- Admin profile
ALTER TABLE "AdminUser" ADD COLUMN "name" TEXT, ADD COLUMN "phone" TEXT, ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Every trust can have its own payment account / QR
ALTER TABLE "Trust"
  ADD COLUMN "accountMode" TEXT NOT NULL DEFAULT 'QR_ONLY',
  ADD COLUMN "razorpayKeyId" TEXT,
  ADD COLUMN "razorpayKeySecretEnc" TEXT,
  ADD COLUMN "razorpayWebhookSecretEnc" TEXT,
  ADD COLUMN "offerQr" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "presets" JSONB;

ALTER TABLE "Donation" ADD COLUMN "trustId" TEXT;
CREATE INDEX "Donation_trustId_idx" ON "Donation"("trustId");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign" ADD COLUMN "trustId" TEXT;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RoomBooking" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "guests" INTEGER NOT NULL,
  "nights" INTEGER NOT NULL,
  "checkIn" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomBooking_reference_key" ON "RoomBooking"("reference");
CREATE INDEX "RoomBooking_status_createdAt_idx" ON "RoomBooking"("status", "createdAt");
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

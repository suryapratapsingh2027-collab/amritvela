-- Donor notes + live-alert opt-in
ALTER TABLE "User" ADD COLUMN "liveAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notes" TEXT;

-- Campaigns
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "descriptionEn" TEXT NOT NULL DEFAULT '',
  "descriptionHi" TEXT,
  "descriptionHing" TEXT,
  "descriptionPa" TEXT,
  "imageUrl" TEXT,
  "targetAmount" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- Donations: campaign + unique receipt number
ALTER TABLE "Donation" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "Donation" ADD COLUMN "receiptNumber" TEXT;
CREATE UNIQUE INDEX "Donation_receiptNumber_key" ON "Donation"("receiptNumber");
CREATE INDEX "Donation_campaignId_idx" ON "Donation"("campaignId");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sequences
CREATE TABLE "Counter" (
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- Live Kirtan
CREATE TABLE "LiveSchedule" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "days" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  "onceDate" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastFiredKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Broadcast" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'LIVE_KIRTAN',
  "trigger" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "scheduleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "total" INTEGER NOT NULL DEFAULT 0,
  "sent" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

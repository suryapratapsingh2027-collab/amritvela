CREATE TABLE "GalleryImage" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT 'Sangat Gallery', "imageUrl" TEXT NOT NULL, "altText" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EventPoster" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "imageUrl" TEXT NOT NULL, "eventDate" TEXT, "venue" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "featured" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "EventPoster_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GalleryImage_active_sortOrder_idx" ON "GalleryImage"("active", "sortOrder");
CREATE INDEX "EventPoster_active_featured_createdAt_idx" ON "EventPoster"("active", "featured", "createdAt");

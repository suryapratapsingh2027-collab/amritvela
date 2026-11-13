-- Marathi is offered again (customer language 'mr'): optional Marathi text for trusts and campaigns.
ALTER TABLE "Trust" ADD COLUMN "infoMr" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "descriptionMr" TEXT;

-- The complainant chooses to show their identity or submit anonymously.
ALTER TABLE "Grievance" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Grievance" ADD COLUMN "userMobile" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "userTnjaId" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "userDistrict" TEXT;

-- Grievances filed before confidentiality existed carry the name they were filed with, and
-- responders always saw it: keep them identified. ("Anonymous" was the old placeholder.)
UPDATE "Grievance" SET "isAnonymous" = false
WHERE "userName" IS NOT NULL AND "userName" <> '' AND "userName" <> 'Anonymous';

-- Anonymous grievances keep no identity at all.
UPDATE "Grievance" SET "userName" = NULL, "userEmail" = NULL WHERE "isAnonymous" = true;

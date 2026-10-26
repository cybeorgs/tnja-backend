-- DISTRICT-level tournaments now record their district, so that district's
-- president/secretary manage them (e.g. ones the Super Admin creates).
ALTER TABLE "Tournament" ADD COLUMN "districtId" TEXT;

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing district tournaments from the host club, else the creating official.
UPDATE "Tournament" t
SET "districtId" = c."districtId"
FROM "Club" c
WHERE t."level" = 'DISTRICT' AND t."districtId" IS NULL AND t."clubId" = c."id";

UPDATE "Tournament" t
SET "districtId" = COALESCE(m."assignedDistrictId", m."districtId")
FROM "Member" m
WHERE t."level" = 'DISTRICT' AND t."districtId" IS NULL AND t."officialId" = m."id";

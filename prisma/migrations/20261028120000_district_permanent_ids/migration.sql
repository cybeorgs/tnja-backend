-- CreateTable
CREATE TABLE "PermanentIdCounter" (
    "prefix" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PermanentIdCounter_pkey" PRIMARY KEY ("prefix")
);

-- Carry each district's player count over so player numbering continues
-- (CBE-A-005 was the 5th player, so the next one is CBE-STU-A006).
-- Already-issued IDs are permanent and are not rewritten.
INSERT INTO "PermanentIdCounter" ("prefix", "seq")
SELECT COALESCE("code", UPPER(LEFT(REGEXP_REPLACE("name", '[^A-Za-z]', '', 'g'), 3))) || '-STU', "playerIdSeq"
FROM "District"
WHERE "playerIdSeq" > 0
ON CONFLICT ("prefix") DO UPDATE SET "seq" = "PermanentIdCounter"."seq" + EXCLUDED."seq";

-- AlterTable
ALTER TABLE "District" DROP COLUMN "playerIdSeq";

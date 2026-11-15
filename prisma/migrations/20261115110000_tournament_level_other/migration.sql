-- "Other" tournament level with a free-text name
ALTER TYPE "EventLevel" ADD VALUE 'OTHER';
ALTER TABLE "Tournament" ADD COLUMN "levelOther" TEXT;

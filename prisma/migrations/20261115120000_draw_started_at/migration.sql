-- Categories are started one by one by the organiser
ALTER TABLE "TournamentDraw" ADD COLUMN "startedAt" TIMESTAMP(3);
-- Draws that already exist were playable before this change: keep them started.
UPDATE "TournamentDraw" SET "startedAt" = "updatedAt" WHERE "startedAt" IS NULL;

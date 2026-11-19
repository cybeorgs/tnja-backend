-- Per-category scoreboard timing
ALTER TABLE "TournamentDraw" ADD COLUMN "matchDuration" INTEGER;
ALTER TABLE "TournamentDraw" ADD COLUMN "goldenScoreLimit" INTEGER;

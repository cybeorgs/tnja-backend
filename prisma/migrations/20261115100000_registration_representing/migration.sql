-- Who a player represents in a tournament (district or unit), confirmed at weigh-in
ALTER TABLE "TournamentRegistration" ADD COLUMN     "representing" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "representingDistrict" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "representingUnit" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "representingConfirmedAt" TIMESTAMP(3);

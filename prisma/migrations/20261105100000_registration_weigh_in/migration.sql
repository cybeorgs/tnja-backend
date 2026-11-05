-- AlterTable
ALTER TABLE "TournamentRegistration" ADD COLUMN     "weighInWeight" TEXT,
ADD COLUMN     "weighInStatus" TEXT,
ADD COLUMN     "weighedAt" TIMESTAMP(3);

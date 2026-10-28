
-- CreateEnum
CREATE TYPE "PointSource" AS ENUM ('PLACEMENT', 'SPORTSMANSHIP', 'VOLUNTEER', 'ATTENDANCE', 'DISCIPLINE');

-- CreateTable
CREATE TABLE "PointRule" (
    "level" "EventLevel" NOT NULL,
    "placement" "Placement" NOT NULL,
    "points" INTEGER NOT NULL,
    CONSTRAINT "PointRule_pkey" PRIMARY KEY ("level","placement")
);

-- CreateTable
CREATE TABLE "PointSettings" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "sportsmanshipPoints" INTEGER NOT NULL DEFAULT 5,
    "volunteerPoints" INTEGER NOT NULL DEFAULT 10,
    "volunteerFullHours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "attendanceMaxPoints" INTEGER NOT NULL DEFAULT 10,
    "disciplineMaxPoints" INTEGER NOT NULL DEFAULT 5,
    "disciplineMinPoints" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PointSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "source" "PointSource" NOT NULL,
    "points" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "tournamentId" TEXT,
    "month" TEXT,
    "reason" TEXT,
    "enteredBy" TEXT,
    "coachId" TEXT,
    "clubId" TEXT,
    "districtId" TEXT,
    "zoneName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyRecord" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "sessionsHeld" INTEGER NOT NULL,
    "sessionsAttended" INTEGER NOT NULL,
    "discipline" INTEGER NOT NULL,
    "coachId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerShift" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "inTime" TIMESTAMP(3) NOT NULL,
    "outTime" TIMESTAMP(3),
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointEntry_key_key" ON "PointEntry"("key");

-- CreateIndex
CREATE INDEX "PointEntry_season_playerId_idx" ON "PointEntry"("season", "playerId");

-- CreateIndex
CREATE INDEX "PointEntry_tournamentId_idx" ON "PointEntry"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecord_playerId_month_key" ON "MonthlyRecord"("playerId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerShift_tournamentId_playerId_key" ON "VolunteerShift"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyRecord" ADD CONSTRAINT "MonthlyRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerShift" ADD CONSTRAINT "VolunteerShift_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerShift" ADD CONSTRAINT "VolunteerShift_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the point table TNJA uses (participation / bronze / silver / gold per level).
-- National starts at the State values; admins change any value in Configuration → Ranking Points.
INSERT INTO "PointRule" ("level", "placement", "points") VALUES
    ('CLUB', 'PARTICIPATION', 6), ('CLUB', 'THIRD', 8), ('CLUB', 'SECOND', 10), ('CLUB', 'FIRST', 13),
    ('DISTRICT', 'PARTICIPATION', 5), ('DISTRICT', 'THIRD', 7), ('DISTRICT', 'SECOND', 9), ('DISTRICT', 'FIRST', 12),
    ('ZONE', 'PARTICIPATION', 3), ('ZONE', 'THIRD', 5), ('ZONE', 'SECOND', 7), ('ZONE', 'FIRST', 10),
    ('STATE', 'PARTICIPATION', 4), ('STATE', 'THIRD', 6), ('STATE', 'SECOND', 8), ('STATE', 'FIRST', 11),
    ('NATIONAL', 'PARTICIPATION', 4), ('NATIONAL', 'THIRD', 6), ('NATIONAL', 'SECOND', 8), ('NATIONAL', 'FIRST', 11);

INSERT INTO "PointSettings" ("id", "updatedAt") VALUES ('GLOBAL', CURRENT_TIMESTAMP);

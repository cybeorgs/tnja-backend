-- CreateEnum
CREATE TYPE "AffiliationKind" AS ENUM ('JOIN', 'RELEASE');

-- CreateEnum
CREATE TYPE "AffiliationTarget" AS ENUM ('COACH', 'CLUB', 'BOTH');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "AffiliationRequest" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" "AffiliationKind" NOT NULL,
    "target" "AffiliationTarget" NOT NULL,
    "coachId" TEXT,
    "clubId" TEXT,
    "message" TEXT,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'PENDING',
    "coachDecision" "AffiliationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "clubDecision" "AffiliationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "coachRemark" TEXT,
    "clubRemark" TEXT,
    "decidedByAdmin" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliationRequest_playerId_status_idx" ON "AffiliationRequest"("playerId", "status");

-- CreateIndex
CREATE INDEX "AffiliationRequest_coachId_status_idx" ON "AffiliationRequest"("coachId", "status");

-- CreateIndex
CREATE INDEX "AffiliationRequest_clubId_status_idx" ON "AffiliationRequest"("clubId", "status");

-- AddForeignKey
ALTER TABLE "AffiliationRequest" ADD CONSTRAINT "AffiliationRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliationRequest" ADD CONSTRAINT "AffiliationRequest_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachReferee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliationRequest" ADD CONSTRAINT "AffiliationRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;


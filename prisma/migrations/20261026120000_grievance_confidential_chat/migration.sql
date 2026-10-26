-- Confidential grievances with a responder chat.

-- Anonymous reference number shown to responders instead of the complainant's details.
ALTER TABLE "Grievance" ADD COLUMN "referenceNo" TEXT;
UPDATE "Grievance" SET "referenceNo" = 'GRV-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 6)) WHERE "referenceNo" IS NULL;
ALTER TABLE "Grievance" ALTER COLUMN "referenceNo" SET NOT NULL;
CREATE UNIQUE INDEX "Grievance_referenceNo_key" ON "Grievance"("referenceNo");

-- New grievances no longer store the complainant's name or email.
ALTER TABLE "Grievance" ALTER COLUMN "userName" DROP NOT NULL;
ALTER TABLE "Grievance" ALTER COLUMN "userEmail" DROP NOT NULL;

ALTER TABLE "Grievance" ADD COLUMN "category" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "assignedToName" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "assignedToRole" TEXT;
ALTER TABLE "Grievance" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Grievance" ADD COLUMN "closedByName" TEXT;

CREATE TABLE "GrievanceMessage" (
    "id" TEXT NOT NULL,
    "grievanceId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT,
    "senderRole" TEXT,
    "senderId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrievanceMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrievanceMessage_grievanceId_createdAt_idx" ON "GrievanceMessage"("grievanceId", "createdAt");

ALTER TABLE "GrievanceMessage" ADD CONSTRAINT "GrievanceMessage_grievanceId_fkey" FOREIGN KEY ("grievanceId") REFERENCES "Grievance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the old single admin reply over as the first message of each chat.
INSERT INTO "GrievanceMessage" ("id", "grievanceId", "senderType", "senderName", "senderRole", "message", "createdAt")
SELECT gen_random_uuid()::TEXT, "id", 'RESPONDER', 'TNJA Admin', NULL, "reply", "updatedAt"
FROM "Grievance"
WHERE "reply" IS NOT NULL AND "reply" <> '';

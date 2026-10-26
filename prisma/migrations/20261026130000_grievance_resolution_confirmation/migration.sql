-- The responder proposes a resolution; the grievance closes only when the complainant confirms it.
ALTER TABLE "Grievance" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Grievance" ADD COLUMN "resolvedByName" TEXT;

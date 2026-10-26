-- Multi-day events (inclusive end date) and a gender restriction.
ALTER TABLE "Event" ADD COLUMN "endDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'BOTH';

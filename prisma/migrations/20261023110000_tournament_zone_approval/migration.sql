-- Zone officers approve zone-level tournaments held in their zone.
-- Existing tournaments keep flowing as before (NOT_REQUIRED).
ALTER TABLE "Tournament" ADD COLUMN "zoneApproval" "Status" NOT NULL DEFAULT 'NOT_REQUIRED';

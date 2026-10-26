-- Optional Google Maps link for event and tournament venues.
ALTER TABLE "Event" ADD COLUMN "mapLink" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "mapLink" TEXT;

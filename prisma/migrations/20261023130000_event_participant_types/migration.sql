-- Events can now target several participant groups at once.
-- Existing events keep their single audience as a one-item list.
ALTER TABLE "Event" ADD COLUMN "participantTypes" "EventParticipantType"[] NOT NULL DEFAULT ARRAY['ALL']::"EventParticipantType"[];
UPDATE "Event" SET "participantTypes" = ARRAY["participantType"];

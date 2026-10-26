-- Coaches can also hold a District/Zone/State President or Secretary office.
ALTER TABLE "CoachReferee" ADD COLUMN "officeRole" "MemberRole";
ALTER TABLE "CoachReferee" ADD COLUMN "assignedDistrictId" TEXT;

ALTER TABLE "CoachReferee" ADD CONSTRAINT "CoachReferee_assignedDistrictId_fkey" FOREIGN KEY ("assignedDistrictId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tournaments created by a coach acting in their office.
ALTER TABLE "Tournament" ADD COLUMN "officialCoachId" TEXT;

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_officialCoachId_fkey" FOREIGN KEY ("officialCoachId") REFERENCES "CoachReferee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

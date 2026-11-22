-- Student profile: district the player represents (null = home district)
ALTER TABLE "Student" ADD COLUMN "representingDistrictId" TEXT;
ALTER TABLE "Student" ADD CONSTRAINT "Student_representingDistrictId_fkey"
  FOREIGN KEY ("representingDistrictId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

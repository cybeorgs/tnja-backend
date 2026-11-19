-- Admin-created coaches need only name, email, mobile and district; the rest of the
-- profile can be filled in later, so those columns may be empty.
ALTER TABLE "CoachReferee"
  ALTER COLUMN "talukId" DROP NOT NULL,
  ALTER COLUMN "pincode" DROP NOT NULL,
  ALTER COLUMN "fatherName" DROP NOT NULL,
  ALTER COLUMN "gender" DROP NOT NULL,
  ALTER COLUMN "dob" DROP NOT NULL,
  ALTER COLUMN "age" DROP NOT NULL,
  ALTER COLUMN "bloodGroup" DROP NOT NULL,
  ALTER COLUMN "aadhaarNumber" DROP NOT NULL,
  ALTER COLUMN "historyInJudo" DROP NOT NULL,
  ALTER COLUMN "historyInOtherMartial" DROP NOT NULL,
  ALTER COLUMN "presentGradeInJudo" DROP NOT NULL;

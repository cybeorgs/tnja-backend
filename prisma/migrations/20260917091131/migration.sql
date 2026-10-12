-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'REJECTED', 'APPROVED', 'REPLAY', 'CLOSED', 'NOT_REQUIRED', 'DISQUALIFIED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Placement" AS ENUM ('FIRST', 'SECOND', 'THIRD', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'DISTRICT_PRESIDENT', 'DISTRICT_SECRETARY', 'ZONE_PRESIDENT', 'ZONE_SECRETARY', 'STATE_PRESIDENT', 'STATE_SECRETARY', 'CEO');

-- CreateEnum
CREATE TYPE "EventLevel" AS ENUM ('CLUB', 'DISTRICT', 'ZONE', 'STATE', 'NATIONAL');

-- CreateEnum
CREATE TYPE "EventParticipantType" AS ENUM ('ALL', 'STUDENT', 'COACH', 'MEMBER', 'CLUB');

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneName" TEXT,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taluk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincode" TEXT,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "Taluk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "tempId" TEXT,
    "name" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "districtId" TEXT,
    "talukId" TEXT,
    "pincode" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "president" TEXT NOT NULL,
    "secretary" TEXT NOT NULL,
    "coach" TEXT NOT NULL,
    "noOfStudents" INTEGER NOT NULL DEFAULT 0,
    "maleStudents" INTEGER NOT NULL DEFAULT 0,
    "femaleStudents" INTEGER NOT NULL DEFAULT 0,
    "age6to11Male" INTEGER NOT NULL DEFAULT 0,
    "age6to11Female" INTEGER NOT NULL DEFAULT 0,
    "age12to18Male" INTEGER NOT NULL DEFAULT 0,
    "age12to18Female" INTEGER NOT NULL DEFAULT 0,
    "age16AboveMale" INTEGER NOT NULL DEFAULT 0,
    "age16AboveFemale" INTEGER NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL DEFAULT '',
    "permanentId" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "permanentId" TEXT,
    "districtId" TEXT NOT NULL,
    "talukId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "age" INTEGER NOT NULL,
    "bloodGroup" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "alternateMobileNumber" TEXT,
    "email" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "addressPincode" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "annualIncome" DOUBLE PRECISION NOT NULL,
    "isBPL" BOOLEAN NOT NULL DEFAULT false,
    "bplProof" TEXT,
    "clubId" TEXT,
    "institutionType" TEXT DEFAULT 'SCHOOL',
    "schoolName" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "degreeDepartment" TEXT,
    "password" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "height" TEXT,
    "weight" TEXT,
    "belt" TEXT,
    "coachId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachReferee" (
    "id" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "permanentId" TEXT,
    "districtId" TEXT NOT NULL,
    "talukId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "age" INTEGER NOT NULL,
    "bloodGroup" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "alternateMobileNumber" TEXT,
    "email" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "historyInJudo" TEXT NOT NULL,
    "historyInOtherMartial" TEXT NOT NULL,
    "presentGradeInJudo" TEXT NOT NULL,
    "coachName" TEXT,
    "refereeName" TEXT,
    "deptName" TEXT,
    "contactPersonDept" TEXT,
    "addressDept" TEXT,
    "employmentType" TEXT,
    "companyName" TEXT,
    "designation" TEXT,
    "clubId" TEXT,
    "password" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachReferee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "permanentId" TEXT,
    "districtId" TEXT NOT NULL,
    "assignedDistrictId" TEXT,
    "talukId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "bloodGroup" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "alternateMobileNumber" TEXT,
    "email" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "addressPincode" TEXT NOT NULL,
    "employmentType" TEXT,
    "companyName" TEXT,
    "designation" TEXT,
    "workLocation" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "level" "EventLevel" NOT NULL DEFAULT 'DISTRICT',
    "participantType" "EventParticipantType" NOT NULL DEFAULT 'ALL',
    "districtId" TEXT,
    "zoneId" TEXT,
    "createdBy" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meetingLink" TEXT,
    "eventSection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3),
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numberOfMats" INTEGER NOT NULL DEFAULT 1,
    "ageFrom" INTEGER NOT NULL DEFAULT 0,
    "ageTo" INTEGER NOT NULL DEFAULT 100,
    "gender" TEXT NOT NULL DEFAULT 'BOTH',
    "allowBPL" BOOLEAN NOT NULL DEFAULT false,
    "beltEligibility" TEXT,
    "bannerImage" TEXT,
    "level" "EventLevel" NOT NULL DEFAULT 'DISTRICT',
    "districtApproval" "Status" NOT NULL DEFAULT 'PENDING',
    "stateApproval" "Status" NOT NULL DEFAULT 'PENDING',
    "superAdminApproval" "Status" NOT NULL DEFAULT 'PENDING',
    "ceoApproval" "Status" NOT NULL DEFAULT 'PENDING',
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "rejectionRemark" TEXT,
    "zoneId" TEXT,
    "clubId" TEXT,
    "officialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "registrationClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMat" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matNumber" INTEGER NOT NULL,
    "refereeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentMat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRegistration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "coachId" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "height" TEXT,
    "weight" TEXT,
    "belt" TEXT,
    "placement" "Placement" DEFAULT 'PARTICIPATION',
    "ageGroup" TEXT NOT NULL DEFAULT 'SENIOR',
    "weightCategory" TEXT NOT NULL DEFAULT 'ALL',
    "gender" "Gender" NOT NULL DEFAULT 'MALE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRegistrationMessage" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentRegistrationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "playerFee" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "coachFee" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "memberFee" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "clubFee" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grievance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "reply" TEXT,
    "remark" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentDraw" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "exactAge" INTEGER NOT NULL DEFAULT 0,
    "gender" TEXT NOT NULL,
    "weightCategory" TEXT NOT NULL,
    "matNumber" INTEGER NOT NULL DEFAULT 1,
    "rounds" JSONB NOT NULL,
    "isConcluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AadhaarOTP" (
    "id" TEXT NOT NULL,
    "aadhaar" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AadhaarOTP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_name_key" ON "District"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Taluk_districtId_name_key" ON "Taluk"("districtId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Club_tempId_key" ON "Club"("tempId");

-- CreateIndex
CREATE UNIQUE INDEX "Club_email_key" ON "Club"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Club_permanentId_key" ON "Club"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_tempId_key" ON "Student"("tempId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_permanentId_key" ON "Student"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_mobileNumber_key" ON "Student"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_aadhaarNumber_key" ON "Student"("aadhaarNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReferee_tempId_key" ON "CoachReferee"("tempId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReferee_permanentId_key" ON "CoachReferee"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReferee_mobileNumber_key" ON "CoachReferee"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReferee_email_key" ON "CoachReferee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReferee_aadhaarNumber_key" ON "CoachReferee"("aadhaarNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tempId_key" ON "Member"("tempId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_permanentId_key" ON "Member"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_mobileNumber_key" ON "Member"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Member_aadhaarNumber_key" ON "Member"("aadhaarNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMat_tournamentId_matNumber_key" ON "TournamentMat"("tournamentId", "matNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_ageGroup_weigh_key" ON "TournamentRegistration"("tournamentId", "playerId", "ageGroup", "weightCategory");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentDraw_tournamentId_ageGroup_exactAge_gender_weight_key" ON "TournamentDraw"("tournamentId", "ageGroup", "exactAge", "gender", "weightCategory");

-- CreateIndex
CREATE UNIQUE INDEX "AadhaarOTP_aadhaar_key" ON "AadhaarOTP"("aadhaar");

-- AddForeignKey
ALTER TABLE "Taluk" ADD CONSTRAINT "Taluk_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachReferee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReferee" ADD CONSTRAINT "CoachReferee_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReferee" ADD CONSTRAINT "CoachReferee_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReferee" ADD CONSTRAINT "CoachReferee_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_assignedDistrictId_fkey" FOREIGN KEY ("assignedDistrictId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_officialId_fkey" FOREIGN KEY ("officialId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMat" ADD CONSTRAINT "TournamentMat_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "CoachReferee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMat" ADD CONSTRAINT "TournamentMat_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachReferee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistrationMessage" ADD CONSTRAINT "TournamentRegistrationMessage_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "TournamentRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentDraw" ADD CONSTRAINT "TournamentDraw_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMessage" ADD CONSTRAINT "TournamentMessage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

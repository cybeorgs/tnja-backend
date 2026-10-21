-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'BPL_REJECTED';

-- AlterTable
ALTER TABLE "District" ADD COLUMN "code" TEXT,
ADD COLUMN "playerIdSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");

-- CreateTable
CREATE TABLE "BlockedAadhaar" (
    "id" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "reason" TEXT,
    "blockedBy" TEXT,
    "sourceTempId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedAadhaar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedAadhaar_aadhaarNumber_key" ON "BlockedAadhaar"("aadhaarNumber");

-- Seed district codes with the railway station code of each district headquarters.
-- Districts without their own station use a proposed code; admins can edit any code
-- in Admin → Settings before player IDs are issued.
UPDATE "District" AS d SET "code" = c.code
FROM (VALUES
    ('Ariyalur', 'ALU'),
    ('Chengalpattu', 'CGL'),
    ('Chennai', 'MAS'),
    ('Coimbatore', 'CBE'),
    ('Cuddalore', 'CUPJ'),
    ('Dharmapuri', 'DPJ'),
    ('Dindigul', 'DG'),
    ('Erode', 'ED'),
    ('Kallakurichi', 'KLKI'),
    ('Kanchipuram', 'CJ'),
    ('Kanniyakumari', 'CAPE'),
    ('Karur', 'KRR'),
    ('Krishnagiri', 'KRGI'),
    ('Madurai', 'MDU'),
    ('Mayiladuthurai', 'MV'),
    ('Nagapattinam', 'NGT'),
    ('Namakkal', 'NMKL'),
    ('Nilgiris', 'UAM'),
    ('Perambalur', 'PMBR'),
    ('Pudukkottai', 'PDKT'),
    ('Ramanathapuram', 'RMD'),
    ('Ranipet', 'RNPT'),
    ('Salem', 'SA'),
    ('Sivaganga', 'SVGA'),
    ('Tenkasi', 'TSI'),
    ('Thanjavur', 'TJ'),
    ('Theni', 'TENI'),
    ('Thoothukudi', 'TN'),
    ('Tiruchirappalli', 'TPJ'),
    ('Tirunelveli', 'TEN'),
    ('Tirupathur', 'TPT'),
    ('Tiruppur', 'TUP'),
    ('Tiruvallur', 'TRL'),
    ('Tiruvannamalai', 'TNM'),
    ('Tiruvarur', 'TVR'),
    ('Vellore', 'VLR'),
    ('Viluppuram', 'VM'),
    ('Virudhunagar', 'VPT')
) AS c(name, code)
WHERE d."name" = c.name;

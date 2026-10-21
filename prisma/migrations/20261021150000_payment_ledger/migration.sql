-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('TOURNAMENT', 'EVENT');

-- CreateTable
CREATE TABLE "PaymentLedger" (
    "id" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "payerType" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "payerName" TEXT,
    "referenceId" TEXT,
    "referenceTitle" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "RegistrationPaymentStatus" NOT NULL DEFAULT 'CAPTURED',
    "method" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLedger_razorpayPaymentId_key" ON "PaymentLedger"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "PaymentLedger_purpose_paidAt_idx" ON "PaymentLedger"("purpose", "paidAt");

-- Backfill paid tournament entries recorded before the ledger existed. Only the
-- Razorpay payment ID was stored, so the amount is the tournament's entry fee.
-- (Event payments were never recorded, so there is nothing to backfill for them.)
INSERT INTO "PaymentLedger" ("id", "purpose", "payerType", "payerId", "payerName", "referenceId", "referenceTitle",
                             "razorpayPaymentId", "amount", "status", "paidAt", "createdAt")
SELECT gen_random_uuid()::text, 'TOURNAMENT', 'PLAYER', tr."playerId", s."fullName", t."id", t."title",
       tr."paymentId", ROUND(t."entryFee" * 100)::int, 'CAPTURED', tr."createdAt", tr."createdAt"
FROM "TournamentRegistration" tr
JOIN "Tournament" t ON t."id" = tr."tournamentId"
LEFT JOIN "Student" s ON s."id" = tr."playerId"
WHERE tr."paymentId" IS NOT NULL AND t."entryFee" > 0
ON CONFLICT ("razorpayPaymentId") DO NOTHING;

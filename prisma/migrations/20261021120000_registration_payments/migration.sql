-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('PLAYER', 'COACH', 'MEMBER', 'CLUB');

-- CreateEnum
CREATE TYPE "RegistrationPaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "RegistrationPayment" (
    "id" TEXT NOT NULL,
    "applicantType" "RegistrationType" NOT NULL,
    "applicantId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "RegistrationPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RazorpayWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationPayment_razorpayOrderId_key" ON "RegistrationPayment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationPayment_razorpayPaymentId_key" ON "RegistrationPayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "RegistrationPayment_applicantType_applicantId_idx" ON "RegistrationPayment"("applicantType", "applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayWebhookEvent_eventId_key" ON "RazorpayWebhookEvent"("eventId");


import crypto from "crypto";
import type { RegistrationType } from "@prisma/client";
import prisma from "../../database/prisma.js";
import { getRazorpay, getRazorpayKeyId, getRazorpayKeySecret } from "../../config/razorpay.js";
import { sendApprovalEmail } from "../../config/mailer.js";
import { MAIL_ROLE_LABEL, findApplicant, isBplExempt, logApplicationAction, type Applicant } from "./applicant.js";
import { issuePermanentId } from "./permanentId.service.js";

/** An expected failure whose message is safe to show to the applicant. */
export class PaymentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

const CURRENCY = "INR";

const FEE_FIELD = {
  PLAYER: "playerFee",
  COACH: "coachFee",
  MEMBER: "memberFee",
  CLUB: "clubFee",
} as const satisfies Record<RegistrationType, string>;

function requireRazorpay() {
  const razorpay = getRazorpay();
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!razorpay || !keyId || !keySecret) {
    console.error("[Payments] Razorpay credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
    throw new PaymentError(503, "Payment services are not configured. Please try again later or contact the TNJA office.");
  }
  return { razorpay, keyId, keySecret };
}

/** Constant-time check of a hex HMAC-SHA256 signature. */
export function isValidSignature(payload: string | Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== "string" || !signature) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function getRegistrationFeePaise(type: RegistrationType): Promise<number> {
  const settings = await prisma.globalSettings.upsert({ where: { id: "GLOBAL" }, update: {}, create: { id: "GLOBAL" } });
  return Math.round(settings[FEE_FIELD[type]] * 100);
}

function assertPayable(applicant: Applicant | null): asserts applicant is Applicant {
  if (!applicant) throw new PaymentError(404, "Application not found.");
  if (applicant.permanentId || applicant.isPaid) throw new PaymentError(409, "Your registration fee is already paid and your ID has been issued.");
  if (applicant.status !== "APPROVED") throw new PaymentError(409, "Your application must be approved before you can pay the registration fee.");
  if (isBplExempt(applicant)) throw new PaymentError(409, "BPL registrations are exempt from the registration fee.");
}

// ── Order creation ─────────────────────────────────────────────────────────────

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

/** Creates a Razorpay order for the applicant's registration fee. The amount always comes from server settings. */
export async function createRegistrationOrder(type: RegistrationType, applicantId: string): Promise<CreatedOrder> {
  const { razorpay, keyId } = requireRazorpay();
  const applicant = await findApplicant(prisma, type, applicantId);
  assertPayable(applicant);

  const amount = await getRegistrationFeePaise(type);
  if (amount <= 0) {
    console.error(`[Payments] Registration fee for ${type} is not configured (amount=${amount}).`);
    throw new PaymentError(503, "The registration fee is not configured. Please contact the TNJA office.");
  }

  const order = await razorpay.orders.create({
    amount,
    currency: CURRENCY,
    receipt: `reg_${applicant.tempId}`.slice(0, 40),
    notes: { applicantType: type, applicantId: applicant.id, tempId: applicant.tempId },
  });

  await prisma.registrationPayment.create({
    data: { applicantType: type, applicantId: applicant.id, razorpayOrderId: order.id, amount, currency: CURRENCY },
  });

  return { orderId: order.id, amount, currency: CURRENCY, keyId };
}

// ── Settlement (shared by Checkout verification and webhooks) ──────────────────

export type SettlementOutcome =
  | { outcome: "ISSUED" | "ALREADY_ISSUED"; permanentId: string }
  | { outcome: "UNKNOWN_ORDER" | "AMOUNT_MISMATCH" | "NOT_ELIGIBLE" };

interface CapturedPayment {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  source: "checkout" | "webhook";
}

/**
 * Records a captured payment and issues the permanent ID, in one transaction.
 * Safe to call any number of times for the same payment, from any source.
 */
export async function settleCapturedPayment(captured: CapturedPayment): Promise<SettlementOutcome> {
  let issuedTo: Applicant | null = null;

  const result = await prisma.$transaction(async (tx): Promise<SettlementOutcome> => {
    const payment = await tx.registrationPayment.findUnique({ where: { razorpayOrderId: captured.orderId } });
    if (!payment) return { outcome: "UNKNOWN_ORDER" };

    if (payment.amount !== captured.amount || payment.currency !== captured.currency) {
      console.error(
        `[Payments] Amount mismatch on order ${captured.orderId}: expected ${payment.amount} ${payment.currency}, got ${captured.amount} ${captured.currency}`,
      );
      return { outcome: "AMOUNT_MISMATCH" };
    }

    const { count: newlyCaptured } = await tx.registrationPayment.updateMany({
      where: { id: payment.id, status: { not: "CAPTURED" } },
      data: { status: "CAPTURED", razorpayPaymentId: captured.paymentId, paidAt: new Date(), failureReason: null },
    });

    const applicant = await findApplicant(tx, payment.applicantType, payment.applicantId);
    if (!applicant) {
      console.error(`[Payments] Order ${captured.orderId} was paid but applicant ${payment.applicantType}/${payment.applicantId} no longer exists.`);
      return { outcome: "NOT_ELIGIBLE" };
    }

    if (newlyCaptured) {
      await logApplicationAction(tx, applicant, "PAYMENT_CAPTURED", `${captured.paymentId} · ₹${payment.amount / 100} · via ${captured.source}`);
    }

    const permanentId = await issuePermanentId(tx, applicant.type, applicant.id, "PAYMENT_CAPTURED");
    if (permanentId) {
      issuedTo = applicant;
      return { outcome: "ISSUED", permanentId };
    }

    // Re-read: another transaction may have issued the ID after our first read.
    const current = await findApplicant(tx, applicant.type, applicant.id);
    if (current?.permanentId) return { outcome: "ALREADY_ISSUED", permanentId: current.permanentId };

    if (newlyCaptured) {
      console.error(`[Payments] Order ${captured.orderId} was paid but ${applicant.tempId} is ${applicant.status}; needs manual review/refund.`);
      await logApplicationAction(tx, applicant, "PAYMENT_NEEDS_REVIEW", `Paid while application status was ${applicant.status}`);
    }
    return { outcome: "NOT_ELIGIBLE" };
  });

  if (result.outcome === "ISSUED" && issuedTo) {
    await sendIdIssuedEmail(issuedTo, result.permanentId);
  }
  return result;
}

/** Marks an unsettled order as failed. A later successful attempt on the same order still settles normally. */
export async function markPaymentFailed(orderId: string, reason: string | null) {
  await prisma.registrationPayment.updateMany({
    where: { razorpayOrderId: orderId, status: { in: ["CREATED", "AUTHORIZED"] } },
    data: { status: "FAILED", failureReason: reason?.slice(0, 500) ?? null },
  });
}

async function sendIdIssuedEmail(applicant: Applicant, permanentId: string) {
  try {
    await sendApprovalEmail({
      toEmail: applicant.email,
      toName: applicant.displayName,
      tempId: applicant.tempId,
      permanentId,
      password: "Use your existing password",
      role: MAIL_ROLE_LABEL[applicant.type],
    });
  } catch (mailErr) {
    // The ID is already committed; a failed email must not undo or fail the payment.
    console.error("[Mailer] Failed to send ID issued email:", mailErr);
  }
}

// ── Checkout verification ─────────────────────────────────────────────────────

export interface CheckoutResult {
  status: "ISSUED" | "PENDING";
  permanentId?: string;
}

/**
 * Verifies a Checkout success callback for the logged-in applicant.
 * The signature proves the response came from Razorpay; the payment is then
 * fetched from Razorpay so the ID is issued only for money actually captured.
 */
export async function verifyCheckoutPayment(
  type: RegistrationType,
  applicantId: string,
  input: { orderId: unknown; paymentId: unknown; signature: unknown },
): Promise<CheckoutResult> {
  const { razorpay, keySecret } = requireRazorpay();
  const { orderId, paymentId, signature } = input;
  if (typeof orderId !== "string" || typeof paymentId !== "string" || !orderId || !paymentId) {
    throw new PaymentError(400, "Missing payment details.");
  }
  if (!isValidSignature(`${orderId}|${paymentId}`, signature, keySecret)) {
    throw new PaymentError(400, "Invalid payment signature.");
  }

  const payment = await prisma.registrationPayment.findUnique({ where: { razorpayOrderId: orderId } });
  if (!payment || payment.applicantType !== type || payment.applicantId !== applicantId) {
    throw new PaymentError(404, "Payment order not found.");
  }

  let rp = await razorpay.payments.fetch(paymentId);
  if (rp.order_id !== orderId) throw new PaymentError(400, "Payment does not belong to this order.");

  if (rp.status === "authorized") {
    // Accounts without auto-capture leave payments authorized; capture for the exact order amount.
    try {
      rp = await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
    } catch (err) {
      console.warn(`[Payments] Capture of ${paymentId} failed, re-fetching:`, (err as any)?.error?.description || err);
      rp = await razorpay.payments.fetch(paymentId);
    }
  }

  if (rp.status === "failed") {
    await markPaymentFailed(orderId, rp.error_description ?? null);
    throw new PaymentError(402, "The payment failed. No money was taken; please try again.");
  }
  if (rp.status !== "captured") return { status: "PENDING" };

  const result = await settleCapturedPayment({
    orderId,
    paymentId,
    amount: Number(rp.amount),
    currency: rp.currency,
    source: "checkout",
  });

  switch (result.outcome) {
    case "ISSUED":
    case "ALREADY_ISSUED":
      return { status: "ISSUED", permanentId: result.permanentId };
    case "AMOUNT_MISMATCH":
      throw new PaymentError(409, "The payment amount does not match the order. Please contact the TNJA office.");
    case "NOT_ELIGIBLE":
      throw new PaymentError(409, "Your payment was received, but your application is no longer approved. The TNJA office will contact you.");
    case "UNKNOWN_ORDER":
      throw new PaymentError(404, "Payment order not found.");
  }
}

import type { PaymentPurpose, RegistrationPaymentStatus } from "@prisma/client";
import prisma from "../../database/prisma.js";
import { getRazorpay } from "../../config/razorpay.js";

const STATUS_FROM_RAZORPAY: Record<string, RegistrationPaymentStatus> = {
  created: "CREATED",
  authorized: "AUTHORIZED",
  captured: "CAPTURED",
  failed: "FAILED",
  refunded: "REFUNDED",
};

/**
 * Records a verified tournament/event checkout payment in the ledger for the
 * admin payments report. The amount, status and method come from Razorpay
 * itself; if Razorpay cannot be reached, the expected fee is recorded instead.
 *
 * Never throws: the player's registration has already succeeded, and a missing
 * ledger row must not turn that into an error.
 */
export async function recordCheckoutPayment(input: {
  purpose: PaymentPurpose;
  payerType: string;
  payerId: string;
  payerName?: string | null;
  referenceId: string;
  referenceTitle: string;
  orderId: string;
  paymentId: string;
  expectedPaise: number;
}) {
  try {
    let amount = input.expectedPaise;
    let currency = "INR";
    let status: RegistrationPaymentStatus = "CAPTURED";
    let method: string | null = null;
    let paidAt = new Date();

    try {
      const rp: any = await getRazorpay()?.payments.fetch(input.paymentId);
      if (rp) {
        amount = Number(rp.amount);
        currency = rp.currency || currency;
        status = STATUS_FROM_RAZORPAY[rp.status] ?? status;
        method = rp.method ?? null;
        if (rp.created_at) paidAt = new Date(Number(rp.created_at) * 1000);
      }
    } catch (err) {
      console.warn(`[Ledger] Could not fetch ${input.paymentId} from Razorpay; recording the expected fee.`, (err as any)?.error?.description || err);
    }

    const data = {
      purpose: input.purpose,
      payerType: input.payerType,
      payerId: input.payerId,
      payerName: input.payerName ?? null,
      referenceId: input.referenceId,
      referenceTitle: input.referenceTitle,
      razorpayOrderId: input.orderId,
      amount,
      currency,
      status,
      method,
      paidAt,
    };
    await prisma.paymentLedger.upsert({
      where: { razorpayPaymentId: input.paymentId },
      update: data,
      create: { ...data, razorpayPaymentId: input.paymentId },
    });
  } catch (err) {
    console.error(`[Ledger] Failed to record payment ${input.paymentId}:`, err);
  }
}

import crypto from "crypto";
import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import { getRazorpayWebhookSecret } from "../../config/razorpay.js";
import { isValidSignature, markPaymentFailed, settleCapturedPayment } from "./payment.service.js";

interface PaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  error_description?: string | null;
}

interface WebhookEvent {
  event: string;
  payload?: { payment?: { entity?: PaymentEntity } };
}

type Disposition = "PROCESSED" | "IGNORED";

async function processEvent(event: WebhookEvent): Promise<Disposition> {
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return "IGNORED";

  switch (event.event) {
    // order.paid carries the captured payment entity too; both settle idempotently.
    case "payment.captured":
    case "order.paid": {
      const result = await settleCapturedPayment({
        orderId: payment.order_id,
        paymentId: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        source: "webhook",
      });
      // Orders raised for events/tournaments are not registration payments.
      return result.outcome === "UNKNOWN_ORDER" ? "IGNORED" : "PROCESSED";
    }
    case "payment.failed":
      await markPaymentFailed(payment.order_id, payment.error_description ?? null);
      return "PROCESSED";
    default:
      return "IGNORED";
  }
}

/**
 * POST /api/webhooks/razorpay
 *
 * Mounted with express.raw(): the signature is an HMAC of the exact bytes
 * Razorpay sent, so the body must not be parsed before verification.
 * Responds 2xx once handled (including duplicates) and 5xx on failure so
 * Razorpay retries.
 */
export const razorpayWebhook = async (req: Request, res: Response) => {
  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET is not configured; rejecting delivery.");
    return res.status(503).json({ error: "Webhook not configured" });
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) || !isValidSignature(rawBody, req.header("x-razorpay-signature"), secret)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const eventId = req.header("x-razorpay-event-id") || crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventType = String(event.event || "unknown");

  const seen = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
  if (seen && seen.status !== "FAILED") return res.json({ status: "duplicate" });

  try {
    const status = await processEvent(event);
    await prisma.razorpayWebhookEvent.upsert({
      where: { eventId },
      create: { eventId, eventType, status, processedAt: new Date() },
      update: { status, error: null, processedAt: new Date() },
    });
    return res.json({ status: status.toLowerCase() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Webhook] Failed to process ${eventType} (${eventId}):`, message);
    await prisma.razorpayWebhookEvent
      .upsert({
        where: { eventId },
        create: { eventId, eventType, status: "FAILED", error: message.slice(0, 1000) },
        update: { status: "FAILED", error: message.slice(0, 1000) },
      })
      .catch((logErr) => console.error("[Webhook] Could not record failure:", logErr));
    return res.status(500).json({ error: "Processing failed" });
  }
};

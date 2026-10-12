import type { Response } from "express";
import Razorpay from "razorpay";

// The Razorpay SDK throws if constructed without credentials, so it is created
// lazily on first use instead of at module import time. Missing credentials
// disable payments only; the rest of the API keeps working.

let client: Razorpay | null = null;

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** Returns the Razorpay client, or null when credentials are not configured. */
export function getRazorpay(): Razorpay | null {
  if (client) return client;
  const creds = getCredentials();
  if (!creds) return null;
  client = new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
  return client;
}

/**
 * Returns the secret used to verify payment signatures, or null when not configured.
 * Callers must not fall back to an empty key: an HMAC with a known key can be forged.
 */
export function getRazorpayKeySecret(): string | null {
  return getCredentials()?.keySecret ?? null;
}

export function sendPaymentNotConfigured(res: Response) {
  console.error("[Payments] Razorpay credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  return res.status(503).json({ error: "Payment services are not configured. Please try again later or contact the TNJA office." });
}

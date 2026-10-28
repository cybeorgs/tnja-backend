import type { Request, Response, NextFunction } from "express";

// In-memory rate limiting for endpoints that cost money (SMS, Aadhaar/KYC, email) or
// can be brute-forced. Counters live in this process, so they reset on restart and are
// per instance: run the API as a single PM2 instance (fork mode) for the limits to hold.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Drop expired buckets once a minute so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref();

/** Counts one hit against `key`. Returns 0 if allowed, otherwise the seconds until it is. */
export function hit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= max) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  bucket.count++;
  return 0;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} minutes` : `${Math.ceil(minutes / 60)} hours`;
}

export function sendTooMany(res: Response, retryAfter: number, message = "Too many requests.") {
  res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({ error: `${message} Please try again in ${formatWait(retryAfter)}.` });
}

interface LimitOptions {
  name: string;
  max: number;
  windowMs: number;
  /** What to count by. Defaults to the client IP (trust proxy is set, so this is the real IP behind Nginx). */
  key?: (req: Request) => string | undefined;
  message?: string;
}

/** Express middleware: rejects with 429 once `max` hits per key are used up within `windowMs`. */
export function rateLimit({ name, max, windowMs, key = (req) => req.ip, message }: LimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = key(req);
    if (!id) return next();
    const wait = hit(`${name}:${id}`, max, windowMs);
    if (wait) {
      console.warn(`[RateLimit] ${name} blocked for ${wait}s`);
      return sendTooMany(res, wait, message);
    }
    next();
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A daily spending cap across all users for one paid provider, so a bot or a bug can never
 * run up an unbounded bill. Set the limit with the env var; 0 disables the cap.
 */
export function dailyBudget(name: string, envVar: string, defaultMax: number) {
  return rateLimit({
    name: `budget:${name}`,
    max: Number(process.env[envVar] ?? defaultMax) || Number.MAX_SAFE_INTEGER,
    windowMs: DAY_MS,
    key: () => "global",
    message: "This verification is temporarily unavailable due to high demand.",
  });
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const lower = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : undefined);

// Limits per route. Per-IP limits are generous because a club may register many players
// from one office connection; per-target limits stop one number/email being spammed.
export const limits = {
  mobileOtpSend: [
    rateLimit({ name: "mobile-otp-send:ip", max: 40, windowMs: HOUR_MS, message: "Too many OTP requests from this network." }),
    rateLimit({ name: "mobile-otp-send:target", max: 5, windowMs: HOUR_MS, key: (req) => lower(req.body?.target), message: "Too many OTPs sent to this mobile number." }),
    dailyBudget("sms", "SMS_DAILY_LIMIT", 1000),
  ],
  emailOtpSend: [
    rateLimit({ name: "email-otp-send:ip", max: 40, windowMs: HOUR_MS, message: "Too many OTP requests from this network." }),
    rateLimit({ name: "email-otp-send:target", max: 5, windowMs: HOUR_MS, key: (req) => lower(req.body?.target), message: "Too many OTPs sent to this email." }),
  ],
  otpVerify: [
    rateLimit({ name: "otp-verify:ip", max: 60, windowMs: 15 * MINUTE_MS, message: "Too many verification attempts." }),
  ],
  aadhaarStart: [
    rateLimit({ name: "aadhaar-start:ip", max: 30, windowMs: HOUR_MS, message: "Too many Aadhaar verification attempts from this network." }),
    rateLimit({ name: "aadhaar-start:target", max: 5, windowMs: HOUR_MS, key: (req) => lower(req.body?.aadhaarNumber), message: "Too many verification attempts for this Aadhaar number." }),
    dailyBudget("aadhaar", "AADHAAR_DAILY_LIMIT", 500),
  ],
  aadhaarCheck: [
    rateLimit({ name: "aadhaar-check:ip", max: 120, windowMs: 10 * MINUTE_MS, message: "Too many status checks." }),
  ],
  forgotPassword: [
    rateLimit({ name: "forgot-password:ip", max: 10, windowMs: HOUR_MS, message: "Too many password reset requests." }),
    rateLimit({ name: "forgot-password:target", max: 3, windowMs: HOUR_MS, key: (req) => lower(req.body?.email), message: "Too many password reset requests for this email." }),
  ],
  login: [
    rateLimit({ name: "login:ip", max: 30, windowMs: 15 * MINUTE_MS, message: "Too many login attempts." }),
  ],
  trackStatus: [
    rateLimit({ name: "track-status:ip", max: 30, windowMs: 15 * MINUTE_MS, message: "Too many attempts." }),
  ],
};

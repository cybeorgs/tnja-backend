import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env.js";
import prisma from "../database/prisma.js";

// OTP verification is stateless, like Aadhaar verification. Email: our own OTP travels in a
// short-lived signed token as an HMAC (never in plain text, so it can't be read from the token).
// Mobile: Twilio Verify generates, sends and checks the code; we only sign a session token tying
// the request to the number. Either way the verified result is another signed token checked at
// registration.

export type OtpChannel = "email" | "mobile";

const MAX_ATTEMPTS = 5;
const EMAIL_OTP_TTL = "10m";
/** Twilio Verify codes expire after 10 minutes. */
const MOBILE_SESSION_TTL = "10m";

// Wrong-OTP attempts per OTP token id. In-memory is enough: tokens live minutes.
const failedAttempts = new Map<string, { count: number; expiresAt: number }>();

function signingKey() {
  return crypto.createHmac("sha256", getJwtSecret()).update("otp-verification").digest("hex");
}

const normalizeTarget = (channel: OtpChannel, target: string) =>
  channel === "email" ? target.trim().toLowerCase() : target.trim();

function hashOtp(channel: OtpChannel, target: string, otp: string, jti: string) {
  return crypto.createHmac("sha256", signingKey()).update(`${channel}:${normalizeTarget(channel, target)}:${otp}:${jti}`).digest("hex");
}

export const isValidEmailFormat = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isValidMobileFormat = (value: unknown): value is string =>
  typeof value === "string" && /^[6-9][0-9]{9}$/.test(value);

/** One email may belong to only one Player, Coach/Referee, Club or Member. Returns an error message if it is taken. */
export async function findEmailConflict(email: string): Promise<string | null> {
  const [student, coach, club, member] = await Promise.all([
    prisma.student.findFirst({ where: { email }, select: { id: true } }),
    prisma.coachReferee.findFirst({ where: { email }, select: { id: true } }),
    prisma.club.findFirst({ where: { email }, select: { id: true } }),
    prisma.member.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (student) return "This Email ID is already registered to a Player.";
  if (coach) return "This Email ID is already registered to a Coach/Referee.";
  if (club) return "This Email ID is already registered to a Club.";
  if (member) return "This Email ID is already registered to a Member.";
  return null;
}

/** Creates a 6-digit email OTP and the token that must be sent back with it. */
export function createEmailOtp(email: string) {
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { purpose: "email-otp", target: normalizeTarget("email", email), otpHash: hashOtp("email", email, otp, jti) },
    signingKey(),
    { expiresIn: EMAIL_OTP_TTL, jwtid: jti } as jwt.SignOptions,
  );
  return { otp, token };
}

/** Checks an email OTP against its token. Returns null on success, otherwise a message for the user. */
export function checkEmailOtp(token: unknown, email: string, otp: string): string | null {
  const channel = "email";
  const target = email;
  let payload: any;
  try {
    payload = typeof token === "string" ? jwt.verify(token, signingKey()) : null;
  } catch {
    payload = null;
  }
  if (!payload || payload.purpose !== `${channel}-otp` || payload.target !== normalizeTarget(channel, target) || !payload.jti) {
    return "OTP has expired. Please click Resend OTP.";
  }

  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (entry.expiresAt < now) failedAttempts.delete(key);
  }
  const attempts = failedAttempts.get(payload.jti);
  if (attempts && attempts.count >= MAX_ATTEMPTS) return "Too many incorrect attempts. Please click Resend OTP.";

  const expected = Buffer.from(payload.otpHash, "hex");
  const actual = Buffer.from(hashOtp(channel, target, otp, payload.jti), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    failedAttempts.set(payload.jti, { count: (attempts?.count ?? 0) + 1, expiresAt: payload.exp * 1000 });
    return "Incorrect OTP. Please check and try again.";
  }
  failedAttempts.set(payload.jti, { count: MAX_ATTEMPTS, expiresAt: payload.exp * 1000 }); // single use
  return null;
}

/**
 * Session token for a mobile OTP sent by Twilio Verify. It carries no code (Twilio holds it);
 * it ties the verify request to the number the code was sent to.
 */
export function createMobileOtpSession(mobile: string) {
  return jwt.sign({ purpose: "mobile-otp", target: normalizeTarget("mobile", mobile) }, signingKey(), { expiresIn: MOBILE_SESSION_TTL });
}

/** True if the session token belongs to this mobile number and hasn't expired. */
export function isMobileOtpSessionValid(token: unknown, mobile: string): boolean {
  if (typeof token !== "string") return false;
  try {
    const payload = jwt.verify(token, signingKey()) as any;
    return payload.purpose === "mobile-otp" && payload.target === normalizeTarget("mobile", mobile);
  } catch {
    return false;
  }
}

export function createVerifiedToken(channel: OtpChannel, target: string) {
  return jwt.sign({ purpose: `${channel}-verified`, target: normalizeTarget(channel, target) }, signingKey(), { expiresIn: "2h" });
}

/** True if the token proves this email / mobile number was verified via OTP. */
export function isVerified(channel: OtpChannel, token: unknown, target: string): boolean {
  if (typeof token !== "string") return false;
  try {
    const payload = jwt.verify(token, signingKey()) as any;
    return payload.purpose === `${channel}-verified` && payload.target === normalizeTarget(channel, target);
  } catch {
    return false;
  }
}

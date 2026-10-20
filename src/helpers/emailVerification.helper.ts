import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env.js";
import prisma from "../database/prisma.js";

// Email OTP verification is stateless, like Aadhaar verification: the OTP travels in a
// short-lived signed token as an HMAC (never in plain text, so it can't be read from the
// token), and the verified result is another signed token checked at registration.

const OTP_PURPOSE = "email-otp";
const VERIFIED_PURPOSE = "email-verified";
const MAX_ATTEMPTS = 5;

// Wrong-OTP attempts per OTP token id. In-memory is enough: tokens live 10 minutes.
const failedAttempts = new Map<string, { count: number; expiresAt: number }>();

function signingKey() {
  return crypto.createHmac("sha256", getJwtSecret()).update("email-verification").digest("hex");
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function hashOtp(email: string, otp: string, jti: string) {
  return crypto.createHmac("sha256", signingKey()).update(`${normalizeEmail(email)}:${otp}:${jti}`).digest("hex");
}

export const isValidEmailFormat = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

/** Creates a 6-digit OTP and the token that must be sent back with it. */
export function createEmailOtp(email: string) {
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { purpose: OTP_PURPOSE, email: normalizeEmail(email), otpHash: hashOtp(email, otp, jti) },
    signingKey(),
    { expiresIn: "10m", jwtid: jti },
  );
  return { otp, token };
}

/** Checks an OTP against its token. Returns null on success, otherwise a message for the user. */
export function checkEmailOtp(token: unknown, email: string, otp: string): string | null {
  let payload: any;
  try {
    payload = typeof token === "string" ? jwt.verify(token, signingKey()) : null;
  } catch {
    payload = null;
  }
  if (!payload || payload.purpose !== OTP_PURPOSE || payload.email !== normalizeEmail(email) || !payload.jti) {
    return "OTP has expired. Please click Resend OTP.";
  }

  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (entry.expiresAt < now) failedAttempts.delete(key);
  }
  const attempts = failedAttempts.get(payload.jti);
  if (attempts && attempts.count >= MAX_ATTEMPTS) return "Too many incorrect attempts. Please click Resend OTP.";

  const expected = Buffer.from(payload.otpHash, "hex");
  const actual = Buffer.from(hashOtp(email, otp, payload.jti), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    failedAttempts.set(payload.jti, { count: (attempts?.count ?? 0) + 1, expiresAt: payload.exp * 1000 });
    return "Incorrect OTP. Please check and try again.";
  }
  failedAttempts.set(payload.jti, { count: MAX_ATTEMPTS, expiresAt: payload.exp * 1000 }); // single use
  return null;
}

export function createEmailVerifiedToken(email: string) {
  return jwt.sign({ purpose: VERIFIED_PURPOSE, email: normalizeEmail(email) }, signingKey(), { expiresIn: "2h" });
}

/** True if the token proves this email was verified via OTP. */
export function isEmailVerified(token: unknown, email: string): boolean {
  if (typeof token !== "string") return false;
  try {
    const payload = jwt.verify(token, signingKey()) as any;
    return payload.purpose === VERIFIED_PURPOSE && payload.email === normalizeEmail(email);
  } catch {
    return false;
  }
}

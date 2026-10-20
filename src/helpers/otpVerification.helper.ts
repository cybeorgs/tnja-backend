import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env.js";
import prisma from "../database/prisma.js";

// OTP verification (email, or mobile via WhatsApp) is stateless, like Aadhaar verification:
// the OTP travels in a short-lived signed token as an HMAC (never in plain text, so it can't
// be read from the token), and the verified result is another signed token checked at registration.

export type OtpChannel = "email" | "mobile";

const MAX_ATTEMPTS = 5;
// The WhatsApp authentication template tells the user the code expires in 5 minutes.
const OTP_TTL: Record<OtpChannel, string> = { email: "10m", mobile: "5m" };

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

/** Creates a 6-digit OTP and the token that must be sent back with it. */
export function createOtp(channel: OtpChannel, target: string) {
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { purpose: `${channel}-otp`, target: normalizeTarget(channel, target), otpHash: hashOtp(channel, target, otp, jti) },
    signingKey(),
    { expiresIn: OTP_TTL[channel], jwtid: jti } as jwt.SignOptions,
  );
  return { otp, token };
}

/** Checks an OTP against its token. Returns null on success, otherwise a message for the user. */
export function checkOtp(channel: OtpChannel, token: unknown, target: string, otp: string): string | null {
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

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env.js";
import prisma from "../database/prisma.js";

// Aadhaar verification is stateless: the DigiLocker session id and the verified result
// travel in short-lived signed tokens. They are signed with a key derived from
// JWT_SECRET so they can never be accepted as login tokens by authenticateJWT.

const DIGILOCKER_SESSION_PURPOSE = "aadhaar-digilocker-session";
const VERIFIED_PURPOSE = "aadhaar-verified";

function signingKey() {
  return crypto.createHmac("sha256", getJwtSecret()).update("aadhaar-verification").digest("hex");
}

export const isValidAadhaarFormat = (value: unknown): value is string =>
  typeof value === "string" && /^[2-9][0-9]{11}$/.test(value);

/** One Aadhaar may belong to only one Player, Coach/Referee or Member. Returns an error message if it is taken. */
export async function findAadhaarConflict(aadhaarNumber: string): Promise<string | null> {
  const [student, coach, member] = await Promise.all([
    prisma.student.findFirst({ where: { aadhaarNumber }, select: { id: true } }),
    prisma.coachReferee.findFirst({ where: { aadhaarNumber }, select: { id: true } }),
    prisma.member.findFirst({ where: { aadhaarNumber }, select: { id: true } }),
  ]);
  if (student) return "This Aadhaar number is already registered to a Player.";
  if (coach) return "This Aadhaar number is already registered to a Coach/Referee.";
  if (member) return "This Aadhaar number is already registered to a Member.";
  return null;
}

export function createDigilockerSessionToken(aadhaar: string, sessionId: string) {
  return jwt.sign({ purpose: DIGILOCKER_SESSION_PURPOSE, aadhaar, sessionId }, signingKey(), { expiresIn: "30m" });
}

/** Returns the DigiLocker session id if the token is valid for this Aadhaar, otherwise null. */
export function readDigilockerSessionToken(token: unknown, aadhaar: string): string | null {
  if (typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, signingKey()) as any;
    if (payload.purpose !== DIGILOCKER_SESSION_PURPOSE || payload.aadhaar !== aadhaar) return null;
    return payload.sessionId;
  } catch {
    return null;
  }
}

export function createAadhaarVerifiedToken(aadhaar: string, name: string | null) {
  return jwt.sign({ purpose: VERIFIED_PURPOSE, aadhaar, name }, signingKey(), { expiresIn: "2h" });
}

/** True if the token proves this Aadhaar number was verified via OTP. */
export function isAadhaarVerified(token: unknown, aadhaar: string): boolean {
  if (typeof token !== "string") return false;
  try {
    const payload = jwt.verify(token, signingKey()) as any;
    return payload.purpose === VERIFIED_PURPOSE && payload.aadhaar === aadhaar;
  } catch {
    return false;
  }
}

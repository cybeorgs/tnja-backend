import prisma from "../database/prisma.js";
import { findAadhaarConflict } from "./aadhaar.helper.js";

/**
 * An email, mobile number or Aadhaar may belong to only one account across Players,
 * Coaches/Referees, Clubs and Members (they all sign in with the same login form).
 * Each function returns a message for the user when the value is taken, otherwise null.
 */

const OWNER_LABEL = { student: "a Player", coach: "a Coach/Referee", club: "a Club", member: "a Member" } as const;

export async function findEmailOwner(email: string): Promise<string | null> {
  const where = { email: { equals: email.trim(), mode: "insensitive" as const } };
  const [student, coach, club, member] = await Promise.all([
    prisma.student.findFirst({ where, select: { id: true } }),
    prisma.coachReferee.findFirst({ where, select: { id: true } }),
    prisma.club.findFirst({ where, select: { id: true } }),
    prisma.member.findFirst({ where, select: { id: true } }),
  ]);
  const owner = student ? "student" : coach ? "coach" : club ? "club" : member ? "member" : null;
  return owner ? `This email is already registered to ${OWNER_LABEL[owner]}.` : null;
}

export async function findMobileOwner(mobileNumber: string): Promise<string | null> {
  const where = { mobileNumber: mobileNumber.trim() };
  const [student, coach, club, member] = await Promise.all([
    prisma.student.findFirst({ where, select: { id: true } }),
    prisma.coachReferee.findFirst({ where, select: { id: true } }),
    prisma.club.findFirst({ where, select: { id: true } }),
    prisma.member.findFirst({ where, select: { id: true } }),
  ]);
  const owner = student ? "student" : coach ? "coach" : club ? "club" : member ? "member" : null;
  return owner ? `This mobile number is already registered to ${OWNER_LABEL[owner]}.` : null;
}

export type ContactConflicts = Partial<Record<"email" | "mobileNumber" | "aadhaarNumber", string>>;

/** Checks whichever of email / mobile / Aadhaar are given; returns only the fields that clash. */
export async function findContactConflicts(input: { email?: unknown; mobileNumber?: unknown; aadhaarNumber?: unknown }): Promise<ContactConflicts> {
  const email = typeof input.email === "string" && input.email.trim() ? input.email : null;
  const mobile = typeof input.mobileNumber === "string" && input.mobileNumber.trim() ? input.mobileNumber : null;
  const aadhaar = typeof input.aadhaarNumber === "string" && input.aadhaarNumber.trim() ? input.aadhaarNumber.trim() : null;

  const [emailMsg, mobileMsg, aadhaarMsg] = await Promise.all([
    email ? findEmailOwner(email) : null,
    mobile ? findMobileOwner(mobile) : null,
    aadhaar ? findAadhaarConflict(aadhaar) : null,
  ]);

  const conflicts: ContactConflicts = {};
  if (emailMsg) conflicts.email = emailMsg;
  if (mobileMsg) conflicts.mobileNumber = mobileMsg;
  if (aadhaarMsg) conflicts.aadhaarNumber = aadhaarMsg;
  return conflicts;
}

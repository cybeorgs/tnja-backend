import type { Prisma, RegistrationType } from "@prisma/client";

/**
 * Players, coaches, members and clubs live in separate tables but share the same
 * registration lifecycle columns. This module is the single place that maps a
 * RegistrationType onto its table so payment and ID logic stays type-agnostic.
 */

export type Db = Prisma.TransactionClient;

export interface Applicant {
  type: RegistrationType;
  id: string;
  tempId: string;
  permanentId: string | null;
  status: string;
  isPaid: boolean;
  isBPL: boolean;
  bplProof: string | null;
  email: string;
  displayName: string;
  districtId: string | null;
}

interface ApplicantRow {
  id: string;
  tempId: string | null;
  permanentId: string | null;
  status: string;
  isPaid: boolean;
  email: string;
  fullName?: string;
  name?: string;
  isBPL?: boolean;
  bplProof?: string | null;
  districtId?: string | null;
}

/** The subset of a Prisma model delegate that the registration lifecycle needs. */
interface ApplicantDelegate {
  findUnique(args: { where: { id: string } }): Promise<ApplicantRow | null>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

/** Type code in the permanent ID issued for each registration type (CBE-STU-A001). */
export const PERMANENT_ID_PREFIX: Record<RegistrationType, string> = {
  PLAYER: "STU",
  COACH: "COH",
  MEMBER: "MEM",
  CLUB: "CLB",
};

/** Label used by the mailer templates. */
export const MAIL_ROLE_LABEL: Record<RegistrationType, "Student" | "Coach" | "Member" | "Club"> = {
  PLAYER: "Student",
  COACH: "Coach",
  MEMBER: "Member",
  CLUB: "Club",
};

/** Legacy lowercase `type` values used by the admin approval API. */
const LEGACY_TYPE: Record<string, RegistrationType> = {
  student: "PLAYER",
  coach: "COACH",
  member: "MEMBER",
  club: "CLUB",
};

const MEMBER_ROLES = new Set([
  "MEMBER",
  "DISTRICT_PRESIDENT",
  "DISTRICT_SECRETARY",
  "ZONE_PRESIDENT",
  "ZONE_SECRETARY",
  "STATE_PRESIDENT",
  "STATE_SECRETARY",
  "CEO",
]);

export function registrationTypeFromLegacy(type: unknown): RegistrationType | null {
  return typeof type === "string" ? LEGACY_TYPE[type] ?? null : null;
}

/** Maps the role in a login token to the table that account lives in. */
export function registrationTypeFromRole(role: unknown): RegistrationType | null {
  if (role === "PLAYER") return "PLAYER";
  if (role === "COACH") return "COACH";
  if (role === "CLUB") return "CLUB";
  if (typeof role === "string" && MEMBER_ROLES.has(role)) return "MEMBER";
  return null;
}

function delegate(db: Db, type: RegistrationType): ApplicantDelegate {
  switch (type) {
    case "PLAYER":
      return db.student as unknown as ApplicantDelegate;
    case "COACH":
      return db.coachReferee as unknown as ApplicantDelegate;
    case "MEMBER":
      return db.member as unknown as ApplicantDelegate;
    case "CLUB":
      return db.club as unknown as ApplicantDelegate;
  }
}

export async function findApplicant(db: Db, type: RegistrationType, id: string): Promise<Applicant | null> {
  const row = await delegate(db, type).findUnique({ where: { id } });
  if (!row) return null;
  return {
    type,
    id: row.id,
    tempId: row.tempId || row.id,
    permanentId: row.permanentId,
    status: row.status,
    isPaid: row.isPaid,
    isBPL: row.isBPL ?? false,
    bplProof: row.bplProof ?? null,
    email: row.email,
    displayName: row.fullName || row.name || "",
    districtId: row.districtId ?? null,
  };
}

/** Conditional update on the applicant's table; returns the number of rows changed (0 or 1). */
export async function updateApplicantWhere(
  db: Db,
  type: RegistrationType,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<number> {
  const { count } = await delegate(db, type).updateMany({ where, data });
  return count;
}

/**
 * Only players can be fee-exempt, and only when they declared BPL and uploaded
 * proof. The approving admin reviews that proof before approving.
 */
export function isBplExempt(applicant: Applicant): boolean {
  return applicant.type === "PLAYER" && applicant.isBPL && Boolean(applicant.bplProof);
}

export async function logApplicationAction(db: Db, applicant: Applicant, action: string, remark?: string | null) {
  await db.applicationLog.create({
    data: { userId: applicant.tempId, role: applicant.type, action, remark: remark ?? null },
  });
}

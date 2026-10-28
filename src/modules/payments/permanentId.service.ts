import { Prisma, type RegistrationType } from "@prisma/client";
import { PERMANENT_ID_PREFIX, findApplicant, logApplicationAction, updateApplicantWhere, type Db } from "./applicant.js";

const MEMBERSHIP_VALIDITY_YEARS = 1;

const SERIES_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const IDS_PER_SERIES = 999;

/** Prefix for an applicant without a district (only possible for legacy clubs). */
const STATE_CODE = "TNJA";

/** Table that holds each registration type; the name is interpolated into SQL, so it must stay a fixed literal. */
const TABLE: Record<RegistrationType, string> = {
  PLAYER: "Student",
  COACH: "CoachReferee",
  MEMBER: "Member",
  CLUB: "Club",
};

/** The n-th ID under a prefix: CBE-STU-A001 … CBE-STU-A999, then CBE-STU-B001 … */
export function formatPermanentId(prefix: string, seq: number): string {
  const series = Math.floor((seq - 1) / IDS_PER_SERIES);
  if (series >= SERIES_LETTERS.length) {
    throw new Error(`Permanent ID range exhausted for ${prefix}.`);
  }
  const number = String(((seq - 1) % IDS_PER_SERIES) + 1).padStart(3, "0");
  return `${prefix}-${SERIES_LETTERS[series]}${number}`;
}

/** Falls back to the first letters of the district name if an admin has not set a code. */
export function districtCodeOf(district: { code: string | null; name: string } | null): string {
  if (!district) return STATE_CODE;
  return district.code || district.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

/**
 * Takes the next number in the applicant's district + type sequence. The
 * applicant row is locked first so concurrent issuers serialize, and the
 * counter only advances for an applicant who is actually eligible, which keeps
 * the sequence free of gaps.
 */
async function nextPermanentId(tx: Db, type: RegistrationType, applicantId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ districtId: string | null; status: string; permanentId: string | null }[]>`
    SELECT "districtId", "status"::text AS "status", "permanentId" FROM ${Prisma.raw(`"${TABLE[type]}"`)} WHERE "id" = ${applicantId} FOR UPDATE`;
  const applicant = rows[0];
  if (!applicant || applicant.status !== "APPROVED" || applicant.permanentId) return null;

  const district = applicant.districtId
    ? await tx.district.findUnique({ where: { id: applicant.districtId }, select: { code: true, name: true } })
    : null;
  const prefix = `${districtCodeOf(district)}-${PERMANENT_ID_PREFIX[type]}`;

  const counter = await tx.permanentIdCounter.upsert({
    where: { prefix },
    create: { prefix, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return formatPermanentId(prefix, counter.seq);
}

/**
 * Issues the applicant's permanent ID, at most once.
 *
 * The update only matches an APPROVED applicant that has no permanent ID yet, so
 * concurrent callers (Checkout verification racing a webhook, a double-clicked
 * approval) cannot issue two IDs: Postgres re-checks the WHERE clause after
 * acquiring the row lock, and the loser updates zero rows. The unique index on
 * permanentId is the final backstop.
 *
 * IDs are sequenced per district and type: CBE-STU-A001 (player),
 * CBE-MEM-A001 (member), CBE-CLB-A001 (club), CBE-COH-A001 (coach).
 *
 * Must run inside a transaction together with whatever made the applicant
 * eligible (approval or captured payment).
 *
 * @returns the new permanent ID, or null when it was not issued (already issued,
 *          or the applicant is not APPROVED).
 */
export async function issuePermanentId(
  tx: Db,
  type: RegistrationType,
  applicantId: string,
  reason: "PAYMENT_CAPTURED" | "BPL_EXEMPT" | "ADMIN_CREATED",
): Promise<string | null> {
  const permanentId = await nextPermanentId(tx, type, applicantId);
  if (!permanentId) return null;

  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + MEMBERSHIP_VALIDITY_YEARS);

  const updated = await updateApplicantWhere(
    tx,
    type,
    { id: applicantId, status: "APPROVED", permanentId: null },
    { permanentId, isPaid: true, mustChangePassword: true, validUntil },
  );
  if (updated === 0) return null;

  const applicant = await findApplicant(tx, type, applicantId);
  if (applicant) await logApplicationAction(tx, applicant, "PERMANENT_ID_ISSUED", `${permanentId} (${reason})`);
  return permanentId;
}

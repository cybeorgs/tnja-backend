import crypto from "crypto";
import type { RegistrationType } from "@prisma/client";
import { PERMANENT_ID_PREFIX, findApplicant, logApplicationAction, updateApplicantWhere, type Db } from "./applicant.js";

const MEMBERSHIP_VALIDITY_YEARS = 1;

const SERIES_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const IDS_PER_SERIES = 999;

function generatePermanentId(type: RegistrationType): string {
  return `${PERMANENT_ID_PREFIX[type]}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

/** The n-th player ID of a district: CBE-A-001 … CBE-A-999, then CBE-B-001 … */
export function formatPlayerId(districtCode: string, seq: number): string {
  const series = Math.floor((seq - 1) / IDS_PER_SERIES);
  if (series >= SERIES_LETTERS.length) {
    throw new Error(`Player ID range exhausted for district ${districtCode}.`);
  }
  const number = String(((seq - 1) % IDS_PER_SERIES) + 1).padStart(3, "0");
  return `${districtCode}-${SERIES_LETTERS[series]}-${number}`;
}

/** Falls back to the first letters of the district name if an admin has not set a code. */
function districtCodeOf(district: { code: string | null; name: string }): string {
  return district.code || district.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

/**
 * Takes the next number in the player's district sequence. The player row is
 * locked first so concurrent issuers serialize, and the counter only advances
 * for a player who is actually eligible, which keeps the sequence free of gaps.
 */
async function nextPlayerId(tx: Db, studentId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ districtId: string; status: string; permanentId: string | null }[]>`
    SELECT "districtId", "status"::text AS "status", "permanentId" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
  const student = rows[0];
  if (!student || student.status !== "APPROVED" || student.permanentId) return null;

  const district = await tx.district.update({
    where: { id: student.districtId },
    data: { playerIdSeq: { increment: 1 } },
    select: { code: true, name: true, playerIdSeq: true },
  });
  return formatPlayerId(districtCodeOf(district), district.playerIdSeq);
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
 * Players get a district-sequenced ID (CBE-A-001); other types keep the
 * prefixed random format.
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
  const permanentId = type === "PLAYER" ? await nextPlayerId(tx, applicantId) : generatePermanentId(type);
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

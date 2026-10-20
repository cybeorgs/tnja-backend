import crypto from "crypto";
import type { RegistrationType } from "@prisma/client";
import { PERMANENT_ID_PREFIX, findApplicant, logApplicationAction, updateApplicantWhere, type Db } from "./applicant.js";

const MEMBERSHIP_VALIDITY_YEARS = 1;

function generatePermanentId(type: RegistrationType): string {
  return `${PERMANENT_ID_PREFIX[type]}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
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
  reason: "PAYMENT_CAPTURED" | "BPL_EXEMPT",
): Promise<string | null> {
  const permanentId = generatePermanentId(type);
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

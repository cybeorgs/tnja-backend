import type { AffiliationStatus, AffiliationTarget, Prisma } from "@prisma/client";
import prisma from "../../database/prisma.js";
import { sendNotificationToUser } from "../../socket/socket.js";

/**
 * Coach / club affiliation workflow.
 *
 * JOIN    — a player applies to one coach or one club; that coach or club decides.
 *           A player has at most one coach and one club, so they must be released
 *           before joining another, and may have one pending application per type.
 * RELEASE — a player asks to leave their coach, club or both. Their current coach
 *           AND club (whichever they have) must both approve; one rejection rejects it.
 *
 * Super Admin / CEO may decide any pending request on the coach's or club's behalf.
 * Each decision is a conditional update, so two people acting at once can't both win.
 */

export class AffiliationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Actor =
  | { kind: "PLAYER"; id: string }
  | { kind: "COACH"; id: string }
  | { kind: "CLUB"; id: string }
  | { kind: "ADMIN"; id: string };

/** Who the logged-in user acts as here. A coach in their office view still decides as a coach. */
export function actorOf(user: { userId: string; role: string; accountType?: string }): Actor | null {
  if (user.role === "PLAYER") return { kind: "PLAYER", id: user.userId };
  if (user.role === "COACH" || user.accountType === "COACH") return { kind: "COACH", id: user.userId };
  if (user.role === "CLUB") return { kind: "CLUB", id: user.userId };
  if (user.role === "SUPER_ADMIN" || user.role === "CEO") return { kind: "ADMIN", id: user.userId };
  return null;
}

const MAX_MESSAGE = 500;
const cleanText = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, MAX_MESSAGE) || null : null);

function notify(userId: string | null | undefined, message: string) {
  if (!userId) return;
  try {
    sendNotificationToUser(userId, { type: "AFFILIATION", message, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error("[Affiliation] notify failed:", err);
  }
}

const REQUEST_INCLUDE = {
  player: {
    select: {
      id: true, fullName: true, permanentId: true, tempId: true, profilePhoto: true, gender: true, dob: true, belt: true,
      district: { select: { name: true } }, coach: { select: { id: true, fullName: true } }, club: { select: { id: true, name: true } },
    },
  },
  coach: { select: { id: true, fullName: true, permanentId: true } },
  club: { select: { id: true, name: true } },
} satisfies Prisma.AffiliationRequestInclude;

// ─── Player ──────────────────────────────────────────────────────────────────

async function approvedPlayer(playerId: string) {
  const player = await prisma.student.findUnique({
    where: { id: playerId },
    select: { id: true, fullName: true, status: true, coachId: true, clubId: true },
  });
  if (!player) throw new AffiliationError(404, "Player not found");
  if (player.status !== "APPROVED") throw new AffiliationError(403, "Your application must be approved before you can join a coach or club.");
  return player;
}

/** The player's current coach and club, and their recent requests. */
export async function getMyAffiliation(playerId: string) {
  const player = await prisma.student.findUnique({
    where: { id: playerId },
    select: {
      districtId: true,
      coach: { select: { id: true, fullName: true, permanentId: true, presentGradeInJudo: true, mobileNumber: true, email: true, district: { select: { name: true } }, club: { select: { name: true } } } },
      club: { select: { id: true, name: true, mobileNumber: true, email: true, district: { select: { name: true } }, taluk: { select: { name: true } } } },
      affiliationRequests: { include: { coach: REQUEST_INCLUDE.coach, club: REQUEST_INCLUDE.club }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!player) throw new AffiliationError(404, "Player not found");
  return { districtId: player.districtId, coach: player.coach, club: player.club, requests: player.affiliationRequests };
}

/** Approved coaches or clubs a player can apply to, optionally by district and name. */
export async function listOptions(type: "COACH" | "CLUB", districtId: string | null, q: string | null) {
  const name = q ? { contains: q, mode: "insensitive" as const } : undefined;
  if (type === "COACH") {
    return prisma.coachReferee.findMany({
      where: { status: "APPROVED", ...(districtId && { districtId }), ...(name && { fullName: name }) },
      select: {
        id: true, fullName: true, permanentId: true, presentGradeInJudo: true,
        district: { select: { name: true } }, taluk: { select: { name: true } }, club: { select: { name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { fullName: "asc" },
      take: 60,
    });
  }
  return prisma.club.findMany({
    where: { status: "APPROVED", ...(districtId && { districtId }), ...(name && { name }) },
    select: {
      id: true, name: true, permanentId: true,
      district: { select: { name: true } }, taluk: { select: { name: true } },
      _count: { select: { students: true, coaches: true } },
    },
    orderBy: { name: "asc" },
    take: 60,
  });
}

export async function applyToJoin(playerId: string, target: AffiliationTarget, targetId: string, message: unknown) {
  if (target !== "COACH" && target !== "CLUB") throw new AffiliationError(400, "Apply to a coach or a club.");
  const player = await approvedPlayer(playerId);
  const isCoach = target === "COACH";

  if (isCoach ? player.coachId : player.clubId) {
    throw new AffiliationError(409, `You already have a ${isCoach ? "coach" : "club"}. Ask to be released before joining another.`);
  }
  const pending = await prisma.affiliationRequest.findFirst({
    where: { playerId, kind: "JOIN", target, status: "PENDING" },
    include: { coach: { select: { fullName: true } }, club: { select: { name: true } } },
  });
  if (pending) {
    throw new AffiliationError(409, `You already applied to ${pending.coach?.fullName ?? pending.club?.name ?? "one"}. Cancel that application to apply elsewhere.`);
  }

  const owner = isCoach
    ? await prisma.coachReferee.findFirst({ where: { id: targetId, status: "APPROVED" }, select: { id: true, fullName: true } })
    : await prisma.club.findFirst({ where: { id: targetId, status: "APPROVED" }, select: { id: true, name: true } });
  if (!owner) throw new AffiliationError(404, `That ${isCoach ? "coach" : "club"} isn't accepting applications.`);

  const request = await prisma.affiliationRequest.create({
    data: {
      playerId, kind: "JOIN", target, message: cleanText(message),
      ...(isCoach ? { coachId: owner.id, coachDecision: "PENDING" } : { clubId: owner.id, clubDecision: "PENDING" }),
    },
  });
  notify(owner.id, `${player.fullName} applied to join you. Review it in Student Requests.`);
  return request;
}

export async function requestRelease(playerId: string, target: AffiliationTarget, message: unknown) {
  const player = await approvedPlayer(playerId);
  const leavesCoach = target === "COACH" || target === "BOTH";
  const leavesClub = target === "CLUB" || target === "BOTH";
  if (!leavesCoach && !leavesClub) throw new AffiliationError(400, "Choose what to leave.");
  if (leavesCoach && !player.coachId) throw new AffiliationError(409, "You don't have a coach to leave.");
  if (leavesClub && !player.clubId) throw new AffiliationError(409, "You aren't in a club to leave.");

  if (await prisma.affiliationRequest.findFirst({ where: { playerId, kind: "RELEASE", status: "PENDING" }, select: { id: true } })) {
    throw new AffiliationError(409, "You already have a release request waiting for approval.");
  }

  // Both the coach and the club the player has now must approve, whatever they are leaving.
  const request = await prisma.affiliationRequest.create({
    data: {
      playerId, kind: "RELEASE", target, message: cleanText(message),
      coachId: player.coachId, clubId: player.clubId,
      coachDecision: player.coachId ? "PENDING" : "NOT_REQUIRED",
      clubDecision: player.clubId ? "PENDING" : "NOT_REQUIRED",
    },
  });
  const what = target === "BOTH" ? "their coach and club" : leavesCoach ? "their coach" : "their club";
  notify(player.coachId, `${player.fullName} asked to be released from ${what}. Your approval is needed.`);
  notify(player.clubId, `${player.fullName} asked to be released from ${what}. Your approval is needed.`);
  return request;
}

export async function cancelRequest(playerId: string, id: string) {
  const { count } = await prisma.affiliationRequest.updateMany({
    where: { id, playerId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  if (count === 0) throw new AffiliationError(409, "This request can no longer be cancelled.");
}

// ─── Coach / club / admin ────────────────────────────────────────────────────

/** Requests addressed to a coach or club (all requests for an admin), newest first. */
export async function getInbox(actor: Actor, scope: "pending" | "history") {
  const mine: Prisma.AffiliationRequestWhereInput =
    actor.kind === "COACH" ? { coachId: actor.id } : actor.kind === "CLUB" ? { clubId: actor.id } : {};
  const requests = await prisma.affiliationRequest.findMany({
    where: { ...mine, ...(scope === "pending" ? { status: "PENDING" } : { status: { not: "PENDING" } }) },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return requests.map((r) => ({ ...r, awaitingMe: r.status === "PENDING" && decidableFields(r, actor).length > 0 }));
}

type DecisionField = "coachDecision" | "clubDecision";

/** The decisions this actor may still make on a request. */
function decidableFields(r: { coachId: string | null; clubId: string | null; coachDecision: AffiliationStatus; clubDecision: AffiliationStatus }, actor: Actor): DecisionField[] {
  const fields: DecisionField[] = [];
  if (r.coachDecision === "PENDING" && (actor.kind === "ADMIN" || (actor.kind === "COACH" && r.coachId === actor.id))) fields.push("coachDecision");
  if (r.clubDecision === "PENDING" && (actor.kind === "ADMIN" || (actor.kind === "CLUB" && r.clubId === actor.id))) fields.push("clubDecision");
  return fields;
}

/**
 * Records a coach's, club's or admin's decision. When every required decision is
 * in, the request is applied: a JOIN assigns the coach/club, a RELEASE clears it.
 * @returns the request's resulting status
 */
export async function decide(actor: Actor, id: string, approve: boolean, remarkInput: unknown): Promise<AffiliationStatus> {
  const remark = cleanText(remarkInput);
  if (!approve && !remark) throw new AffiliationError(400, "Give a reason for rejecting.");

  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.affiliationRequest.findUnique({ where: { id } });
    if (!req) throw new AffiliationError(404, "Request not found");
    if (req.status !== "PENDING") throw new AffiliationError(409, "This request has already been decided.");
    const fields = decidableFields(req, actor);
    if (fields.length === 0) throw new AffiliationError(403, "This request isn't waiting for your decision.");

    const decision: AffiliationStatus = approve ? "APPROVED" : "REJECTED";
    const data: Prisma.AffiliationRequestUpdateManyMutationInput = {
      ...(actor.kind === "ADMIN" && { decidedByAdmin: actor.id }),
    };
    for (const f of fields) {
      data[f] = decision;
      data[f === "coachDecision" ? "coachRemark" : "clubRemark"] = remark;
    }
    const { count } = await tx.affiliationRequest.updateMany({
      where: { id, status: "PENDING", ...Object.fromEntries(fields.map((f) => [f, "PENDING"])) },
      data,
    });
    if (count === 0) throw new AffiliationError(409, "This request was just updated by someone else. Refresh and try again.");

    const now = await tx.affiliationRequest.findUniqueOrThrow({ where: { id } });
    if (now.coachDecision === "REJECTED" || now.clubDecision === "REJECTED") {
      await tx.affiliationRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date() } });
      return { status: "REJECTED" as AffiliationStatus, req: now };
    }
    if (now.coachDecision === "PENDING" || now.clubDecision === "PENDING") {
      return { status: "PENDING" as AffiliationStatus, req: now };
    }
    return { status: await applyApproved(tx, now), req: now };
  });

  await notifyOutcome(result.req, result.status, actor);
  return result.status;
}

/** Applies a fully approved request to the player; CANCELLED when the player's situation has changed since. */
async function applyApproved(
  tx: Prisma.TransactionClient,
  req: { id: string; playerId: string; kind: string; target: AffiliationTarget; coachId: string | null; clubId: string | null },
): Promise<AffiliationStatus> {
  let applied = true;
  if (req.kind === "JOIN") {
    const isCoach = req.target === "COACH";
    const { count } = await tx.student.updateMany({
      where: { id: req.playerId, ...(isCoach ? { coachId: null } : { clubId: null }) },
      data: isCoach ? { coachId: req.coachId } : { clubId: req.clubId },
    });
    applied = count === 1;
    if (applied) {
      // Their other applications of this type are now moot.
      await tx.affiliationRequest.updateMany({
        where: { playerId: req.playerId, kind: "JOIN", target: req.target, status: "PENDING", NOT: { id: req.id } },
        data: { status: "CANCELLED", decidedAt: new Date() },
      });
    }
  } else {
    const leavesCoach = req.target === "COACH" || req.target === "BOTH";
    const leavesClub = req.target === "CLUB" || req.target === "BOTH";
    if (leavesCoach) {
      const { count } = await tx.student.updateMany({ where: { id: req.playerId, coachId: req.coachId }, data: { coachId: null } });
      applied &&= count === 1;
    }
    if (leavesClub) {
      const { count } = await tx.student.updateMany({ where: { id: req.playerId, clubId: req.clubId }, data: { clubId: null } });
      applied &&= count === 1;
    }
  }
  const status: AffiliationStatus = applied ? "APPROVED" : "CANCELLED";
  await tx.affiliationRequest.update({
    where: { id: req.id },
    data: { status, decidedAt: new Date() },
  });
  return status;
}

async function notifyOutcome(
  req: { playerId: string; kind: string; target: AffiliationTarget; coachId: string | null; clubId: string | null; coachDecision: AffiliationStatus; clubDecision: AffiliationStatus },
  status: AffiliationStatus,
  actor: Actor,
) {
  const [player, coach, club] = await Promise.all([
    prisma.student.findUnique({ where: { id: req.playerId }, select: { fullName: true } }),
    req.coachId ? prisma.coachReferee.findUnique({ where: { id: req.coachId }, select: { fullName: true } }) : null,
    req.clubId ? prisma.club.findUnique({ where: { id: req.clubId }, select: { name: true } }) : null,
  ]);
  const name = player?.fullName ?? "The player";

  if (req.kind === "JOIN") {
    const to = coach?.fullName ?? club?.name ?? "the coach/club";
    if (status === "APPROVED") notify(req.playerId, `${to} accepted your application. You are now ${coach ? "their student" : "a member"}.`);
    if (status === "REJECTED") notify(req.playerId, `${to} declined your application.`);
    return;
  }

  if (status === "APPROVED") {
    notify(req.playerId, "Your release request was approved.");
    for (const id of [req.coachId, req.clubId]) notify(id, `${name} has been released.`);
  } else if (status === "REJECTED") {
    notify(req.playerId, "Your release request was rejected.");
  } else if (status === "PENDING") {
    // One side approved; tell the side still to decide.
    const waitingOn = req.coachDecision === "PENDING" ? req.coachId : req.clubDecision === "PENDING" ? req.clubId : null;
    if (waitingOn && waitingOn !== actor.id) notify(waitingOn, `${name}'s release was approved by the other side and now needs your decision.`);
  }
}

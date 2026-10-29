import type { Request, Response } from "express";
import {
  AffiliationError, actorOf, applyToJoin, cancelRequest, decide, getInbox, getMyAffiliation, listOptions, requestRelease,
} from "./affiliation.service.js";

const fail = (res: Response, err: unknown, where: string) => {
  if (err instanceof AffiliationError) return res.status(err.status).json({ error: err.message });
  console.error(`[${where}]`, err);
  return res.status(500).json({ error: "Internal Server Error" });
};

const playerId = (req: Request, res: Response): string | null => {
  const actor = actorOf((req as any).user);
  if (actor?.kind !== "PLAYER") {
    res.status(403).json({ error: "Only players can do this" });
    return null;
  }
  return actor.id;
};

// GET /api/affiliations/me
export const getMine = async (req: Request, res: Response) => {
  const id = playerId(req, res);
  if (!id) return;
  try {
    return res.json(await getMyAffiliation(id));
  } catch (err) {
    return fail(res, err, "affiliations.getMine");
  }
};

// GET /api/affiliations/options?type=COACH|CLUB&districtId=&q=
export const getOptions = async (req: Request, res: Response) => {
  if (!playerId(req, res)) return;
  const type = String(req.query.type || "").toUpperCase();
  if (type !== "COACH" && type !== "CLUB") return res.status(400).json({ error: "type must be COACH or CLUB" });
  try {
    const q = String(req.query.q || "").trim().slice(0, 60) || null;
    return res.json(await listOptions(type, req.query.districtId ? String(req.query.districtId) : null, q));
  } catch (err) {
    return fail(res, err, "affiliations.getOptions");
  }
};

// POST /api/affiliations/join   { target: COACH|CLUB, targetId, message? }
export const join = async (req: Request, res: Response) => {
  const id = playerId(req, res);
  if (!id) return;
  try {
    await applyToJoin(id, req.body?.target, String(req.body?.targetId ?? ""), req.body?.message);
    return res.status(201).json({ message: "Application sent. You'll be notified when it is decided." });
  } catch (err) {
    return fail(res, err, "affiliations.join");
  }
};

// POST /api/affiliations/release   { target: COACH|CLUB|BOTH, message? }
export const release = async (req: Request, res: Response) => {
  const id = playerId(req, res);
  if (!id) return;
  try {
    await requestRelease(id, req.body?.target, req.body?.message);
    return res.status(201).json({ message: "Release request sent. Your coach and club must both approve it." });
  } catch (err) {
    return fail(res, err, "affiliations.release");
  }
};

// POST /api/affiliations/:id/cancel
export const cancel = async (req: Request, res: Response) => {
  const id = playerId(req, res);
  if (!id) return;
  try {
    await cancelRequest(id, String(req.params.id));
    return res.json({ message: "Request cancelled." });
  } catch (err) {
    return fail(res, err, "affiliations.cancel");
  }
};

// GET /api/affiliations/inbox?scope=pending|history   (coach, club, Super Admin / CEO)
export const inbox = async (req: Request, res: Response) => {
  const actor = actorOf((req as any).user);
  if (!actor || actor.kind === "PLAYER") return res.status(403).json({ error: "Only coaches, clubs and admins have student requests" });
  try {
    return res.json(await getInbox(actor, req.query.scope === "history" ? "history" : "pending"));
  } catch (err) {
    return fail(res, err, "affiliations.inbox");
  }
};

// POST /api/affiliations/:id/decide   { decision: APPROVE|REJECT, remark? }
export const decideHandler = async (req: Request, res: Response) => {
  const actor = actorOf((req as any).user);
  if (!actor || actor.kind === "PLAYER") return res.status(403).json({ error: "Only coaches, clubs and admins can decide requests" });
  const decision = String(req.body?.decision || "");
  if (decision !== "APPROVE" && decision !== "REJECT") return res.status(400).json({ error: "decision must be APPROVE or REJECT" });
  try {
    const status = await decide(actor, String(req.params.id), decision === "APPROVE", req.body?.remark);
    const message =
      status === "APPROVED" ? "Approved and applied."
      : status === "REJECTED" ? "Request rejected."
      : status === "CANCELLED" ? "Approved, but the player's coach or club changed in the meantime, so nothing was applied."
      : "Your approval is recorded. Waiting for the other side.";
    return res.json({ status, message });
  } catch (err) {
    return fail(res, err, "affiliations.decide");
  }
};

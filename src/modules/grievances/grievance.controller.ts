import type { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../../database/prisma.js";
import { GRIEVANCE_MEDIA, type GrievanceMediaField, checkGrievanceFileSizes, removeUploadedFiles } from "../../middleware/uploadMiddleware.js";
import { findOfficial } from "../../helpers/official.helper.js";
import { sendGrievanceClosedEmail } from "../../config/mailer.js";
import { stripIdentifyingMetadata } from "../../helpers/mediaMetadata.helper.js";

const ADMIN_ROLES = ["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"];
/** May respond to (and close) any grievance, even one another responder has taken up. */
const OVERRIDE_ROLES = ["SUPER_ADMIN", "CEO"];
const CATEGORIES = ["FINE", "ANOMALY"];
const MAX_MESSAGE_LENGTH = 4000;

// ─── Identity privacy ─────────────────────────────────────────────────────────
// The complainant chooses to show their identity or submit anonymously. The account
// id (userId) never leaves the server. An anonymous grievance stores no identity at
// all; an identified one stores a snapshot from the account that only responders get,
// as `complainant`. Everything is enforced here, not in the UI.

const SAFE_FIELDS = {
  id: true, referenceNo: true, category: true, isAnonymous: true, role: true, subject: true, description: true,
  status: true, remark: true, images: true, documents: true, audios: true, videos: true,
  assignedToId: true, assignedToName: true, assignedToRole: true, resolvedAt: true, resolvedByName: true,
  closedAt: true, closedByName: true,
  createdAt: true, updatedAt: true,
} as const;

const IDENTITY_FIELDS = { userName: true, userEmail: true, userMobile: true, userTnjaId: true, userDistrict: true } as const;
const IDENTITY_CHOICES: Record<string, boolean> = { SHOW: false, ANONYMOUS: true };

/**
 * Replaces the raw identity columns with `complainant`: the snapshot for an identified
 * grievance, or null for an anonymous one (and for viewers who aren't responders).
 */
function withComplainant<T extends Record<string, any>>(row: T, forResponder: boolean) {
  const { userName, userEmail, userMobile, userTnjaId, userDistrict, ...rest } = row;
  const complainant = forResponder && !row.isAnonymous && userName
    ? { name: userName, tnjaId: userTnjaId ?? null, district: userDistrict ?? null, email: userEmail ?? null, mobile: userMobile ?? null }
    : null;
  return { ...rest, complainant };
}

/** Logs a failure without request data or Prisma query arguments, which could carry identity. */
const logError = (label: string, error: any) => console.error(`[Grievance] ${label}:`, error?.code || error?.name || "error");

const roleLabel = (role: string) => role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** GRV- plus six characters that don't reveal the order or count of grievances. */
const newReferenceNo = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "GRV-" + Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
};

/** The responder's display identity: their name and office. */
async function responderIdentity(user: any): Promise<{ name: string; role: string }> {
  if (user.role === "SUPER_ADMIN") return { name: "Super Admin", role: "Super Admin" };
  const official = await findOfficial(user.userId);
  return { name: official?.fullName || "TNJA Official", role: roleLabel(user.role) };
}

/** Owner of the grievance, or a responder; null when neither. */
function viewerOf(grievance: { userId: string }, user: any): "USER" | "RESPONDER" | null {
  if (grievance.userId === user.userId) return "USER";
  if (ADMIN_ROLES.includes(user.role)) return "RESPONDER";
  return null;
}

/** Whether this responder may reply to / close it: it is unassigned, theirs, or they are Super Admin / CEO. */
const canRespond = (grievance: { assignedToId: string | null; status: string }, user: any) =>
  grievance.status !== "CLOSED" &&
  (!grievance.assignedToId || grievance.assignedToId === user.userId || OVERRIDE_ROLES.includes(user.role));

/** The complainant's name and email, looked up server-side only to notify them. */
async function findComplainantContact(userId: string): Promise<{ email: string; name: string } | null> {
  const select = { email: true, fullName: true } as const;
  const person =
    (await prisma.student.findUnique({ where: { id: userId }, select })) ||
    (await prisma.coachReferee.findUnique({ where: { id: userId }, select })) ||
    (await prisma.member.findUnique({ where: { id: userId }, select }));
  if (person?.email) return { email: person.email, name: person.fullName };
  const club = await prisma.club.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  return club?.email ? { email: club.email, name: club.name } : null;
}

/** Identity snapshot for a complainant who chose to show it, read from their own account. */
async function findComplainantProfile(userId: string) {
  const person: any =
    (await prisma.student.findUnique({ where: { id: userId }, select: { fullName: true, email: true, mobileNumber: true, permanentId: true, tempId: true, district: { select: { name: true } } } })) ||
    (await prisma.coachReferee.findUnique({ where: { id: userId }, select: { fullName: true, email: true, mobileNumber: true, permanentId: true, tempId: true, district: { select: { name: true } } } })) ||
    (await prisma.member.findUnique({ where: { id: userId }, select: { fullName: true, email: true, mobileNumber: true, permanentId: true, tempId: true, district: { select: { name: true } } } })) ||
    (await prisma.club.findUnique({ where: { id: userId }, select: { name: true, email: true, mobileNumber: true, permanentId: true, tempId: true, district: { select: { name: true } } } }));
  if (!person) return null;
  return {
    userName: person.fullName ?? person.name,
    userEmail: person.email ?? null,
    userMobile: person.mobileNumber ?? null,
    userTnjaId: person.permanentId ?? person.tempId ?? null,
    userDistrict: person.district?.name ?? null,
  };
}

async function notify(kind: "user" | "admins", userId: string | null, data: any) {
  try {
    const { sendNotificationToUser, sendNotificationToAdmins } = await import("../../socket/socket.js");
    if (kind === "user" && userId) sendNotificationToUser(userId, data);
    else sendNotificationToAdmins(data);
  } catch (wsErr) {
    console.error("WS notification error:", wsErr);
  }
}

// POST /api/grievances
// multipart: category (FINE | ANOMALY), identity (SHOW | ANONYMOUS), subject, description + at least one attachment
export const createGrievance = async (req: Request, res: Response) => {
  // Uploaded files by field (images, documents, audio, videos), each in its own folder.
  const files = ((req as any).files || {}) as Record<string, Express.Multer.File[]>;
  try {
    // The grievance is always filed as the logged-in account, never an id from the form,
    // and identity details come from that account, never from the form.
    const { userId, role } = (req as any).user;
    const { subject, description, category, identity } = req.body;

    const reject = (error: string) => {
      removeUploadedFiles(files);
      return res.status(400).json({ error });
    };

    if (!userId || !role || !subject?.trim() || !description?.trim()) return reject("Missing required fields");
    if (!CATEGORIES.includes(category)) return reject("Select whether this is a Fine or an Anomaly grievance");
    if (!(identity in IDENTITY_CHOICES)) return reject("Choose whether to show your identity or submit anonymously");
    if (Object.values(files).flat().length === 0) return reject("Attach at least one file (image, document, audio or video) as evidence");

    const sizeError = checkGrievanceFileSizes(files);
    if (sizeError) return reject(sizeError);

    const isAnonymous = IDENTITY_CHOICES[identity]!;
    let identitySnapshot = {};
    let uncleanedAttachments = 0;
    if (isAnonymous) {
      // Remove hidden metadata (photo GPS / owner, PDF author, MP3 tags) that could identify them.
      const results = await Promise.all(Object.values(files).flat().map((f) => stripIdentifyingMetadata(f.path)));
      uncleanedAttachments = results.filter((cleaned) => !cleaned).length;
    } else {
      const profile = await findComplainantProfile(userId);
      if (!profile) return reject("Your account details could not be found; try submitting anonymously");
      identitySnapshot = profile;
    }

    const urlsFor = (field: GrievanceMediaField) => {
      const urlPath = GRIEVANCE_MEDIA[field].urlPath;
      return (files[field] || []).map((f) => `${req.protocol}://${req.get("host")}/uploads/${urlPath ? `${urlPath}/` : ""}${f.filename}`);
    };

    let grievance: any = null;
    for (let attempt = 0; !grievance && attempt < 5; attempt++) {
      try {
        grievance = await prisma.grievance.create({
          data: {
            referenceNo: newReferenceNo(),
            category,
            isAnonymous,
            ...identitySnapshot,
            userId,
            role,
            subject: subject.trim(),
            description: description.trim(),
            status: "PENDING",
            images: urlsFor("images"),
            documents: urlsFor("documents"),
            audios: urlsFor("audio"),
            videos: urlsFor("videos"),
          },
          select: SAFE_FIELDS,
        });
      } catch (err: any) {
        if (err?.code !== "P2002") throw err; // referenceNo collision: try another
      }
    }

    notify("admins", null, {
      type: "NEW_GRIEVANCE",
      grievanceId: grievance.id,
      message: `New ${roleLabel(category)} grievance ${grievance.referenceNo}: "${grievance.subject}"`,
    });

    return res.status(201).json({
      message: "Grievance submitted successfully",
      grievance: withComplainant(grievance, false),
      // Anonymous only: attachments whose type can't be cleaned (video, Word/Excel, some audio).
      uncleanedAttachments,
    });
  } catch (error: any) {
    removeUploadedFiles(files);
    logError("create", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /api/grievances/user/:userId — the complainant's own grievances only.
export const getMyGrievances = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    // Not even responders may list a given person's grievances: that would reveal who filed them.
    if ((req as any).user.userId !== userId) {
      return res.status(403).json({ error: "You can only view your own grievances." });
    }
    const grievances = await prisma.grievance.findMany({
      where: { userId },
      select: SAFE_FIELDS,
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(grievances.map((g) => withComplainant(g, false)));
  } catch (error: any) {
    logError("Get My Grievances", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /api/grievances — responders' queue, without the complainants' identities.
export const getAllGrievances = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const grievances = await prisma.grievance.findMany({
      // A responder's own grievances aren't theirs to handle.
      where: { NOT: { userId: user.userId } },
      select: { ...SAFE_FIELDS, ...IDENTITY_FIELDS, _count: { select: { messages: true } } },
      orderBy: { createdAt: "desc" },
    });
    // Responders get `complainant` for identified grievances only; anonymous ones have none.
    return res.status(200).json(
      grievances.map(({ _count, ...g }: any) => ({ ...withComplainant(g, true), messageCount: _count.messages, canRespond: canRespond(g, user) }))
    );
  } catch (error: any) {
    logError("Get All Grievances", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /api/grievances/:id/messages
export const getGrievanceMessages = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const grievance = await prisma.grievance.findUnique({ where: { id: String(req.params.id) } });
    if (!grievance) return res.status(404).json({ error: "Grievance not found" });
    const viewer = viewerOf(grievance, user);
    if (!viewer) return res.status(403).json({ error: "You cannot view this grievance" });

    const messages = await prisma.grievanceMessage.findMany({
      where: { grievanceId: grievance.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, senderType: true, senderName: true, senderRole: true, senderId: true, message: true, createdAt: true },
    });

    // Responders see an identified complainant's name on their messages; anonymous stays unnamed.
    const complainantName = viewer === "RESPONDER" && !grievance.isAnonymous ? grievance.userName : null;
    return res.json({
      messages: messages.map(({ senderId, ...m }: any) => ({
        ...m,
        ...(m.senderType === "USER" && { senderName: complainantName }),
        isMine: viewer === "USER" ? m.senderType === "USER" : senderId === user.userId,
      })),
      isAnonymous: grievance.isAnonymous,
      status: grievance.status,
      canSend: viewer === "USER" ? grievance.status !== "CLOSED" : canRespond(grievance, user),
    });
  } catch (error: any) {
    logError("Get Grievance Messages", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// POST /api/grievances/:id/messages   { message }
// The complainant or a responder adds to the chat; it stays open until the grievance is closed.
// The first responder to reply takes the grievance up.
export const sendGrievanceMessage = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const text = String(req.body.message || "").trim();
    if (!text) return res.status(400).json({ error: "Message cannot be empty" });
    if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });

    const grievance = await prisma.grievance.findUnique({ where: { id: String(req.params.id) } });
    if (!grievance) return res.status(404).json({ error: "Grievance not found" });
    const viewer = viewerOf(grievance, user);
    if (!viewer) return res.status(403).json({ error: "You cannot reply to this grievance" });
    if (grievance.status === "CLOSED") return res.status(409).json({ error: "This grievance is closed; the chat has ended." });

    if (viewer === "USER") {
      const message = await prisma.grievanceMessage.create({
        data: { grievanceId: grievance.id, senderType: "USER", message: text },
      });
      const update = {
        type: "GRIEVANCE_MESSAGE",
        grievanceId: grievance.id,
        message: `New message from the complainant on grievance ${grievance.referenceNo}`,
      };
      if (grievance.assignedToId) notify("user", grievance.assignedToId, update);
      else notify("admins", null, update);
      return res.status(201).json({ message: { id: message.id, senderType: "USER", senderName: null, senderRole: null, message: text, createdAt: message.createdAt, isMine: true } });
    }

    if (!canRespond(grievance, user)) {
      return res.status(403).json({ error: `${grievance.assignedToName} (${grievance.assignedToRole}) is handling this grievance.` });
    }

    const identity = await responderIdentity(user);
    const [message] = await prisma.$transaction([
      prisma.grievanceMessage.create({
        data: { grievanceId: grievance.id, senderType: "RESPONDER", senderName: identity.name, senderRole: identity.role, senderId: user.userId, message: text },
      }),
      prisma.grievance.update({
        where: { id: grievance.id },
        data: {
          status: "REPLAY",
          ...(!grievance.assignedToId && { assignedToId: user.userId, assignedToName: identity.name, assignedToRole: identity.role }),
        },
      }),
    ]);

    notify("user", grievance.userId, {
      type: "GRIEVANCE_REPLY",
      grievanceId: grievance.id,
      message: `${identity.name} (${identity.role}) replied to your grievance "${grievance.subject}"`,
    });

    return res.status(201).json({
      message: { id: message.id, senderType: "RESPONDER", senderName: identity.name, senderRole: identity.role, message: text, createdAt: message.createdAt, isMine: true },
    });
  } catch (error: any) {
    logError("Send Grievance Message", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** Emails the complainant; their address is looked up here and never sent to the responder. */
function emailComplainant(grievance: { userId: string; referenceNo: string; subject: string }, stage: "RESOLVED" | "CLOSED", remark: string, by: string) {
  findComplainantContact(grievance.userId)
    .then((contact) => contact && sendGrievanceClosedEmail({
      stage,
      toEmail: contact.email,
      toName: contact.name,
      referenceNo: grievance.referenceNo,
      subject: grievance.subject,
      remark,
      closedBy: by,
    }))
    .catch((err) => logError(`${stage.toLowerCase()} email failed`, err)); // SMTP errors can quote the address
}

// PUT /api/grievances/:id/resolve   { remark }
// The responder handling it marks it resolved, after replying, with a resolution summary.
// It does not close yet: the complainant is asked to confirm (see confirmResolution).
export const resolveGrievance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const remark = String(req.body.remark || "").trim();
    if (!remark) return res.status(400).json({ error: "Describe how the grievance was resolved" });

    const grievance = await prisma.grievance.findUnique({ where: { id: String(req.params.id) } });
    if (!grievance) return res.status(404).json({ error: "Grievance not found" });
    if (grievance.userId === user.userId) return res.status(403).json({ error: "You cannot resolve your own grievance" });
    if (grievance.status === "CLOSED") return res.status(409).json({ error: "This grievance is already closed" });
    if (!canRespond(grievance, user)) {
      return res.status(403).json({ error: `Only ${grievance.assignedToName} (${grievance.assignedToRole}), who is handling it, can resolve this grievance.` });
    }
    const replies = await prisma.grievanceMessage.count({ where: { grievanceId: grievance.id, senderType: "RESPONDER" } });
    if (replies === 0) {
      return res.status(400).json({ error: "Respond to the complainant in the chat before marking it resolved" });
    }

    const identity = await responderIdentity(user);
    const by = `${identity.name} (${identity.role})`;
    const updated = await prisma.grievance.update({
      where: { id: grievance.id },
      data: { remark, resolvedAt: new Date(), resolvedByName: by },
      select: SAFE_FIELDS,
    });

    notify("user", grievance.userId, {
      type: "GRIEVANCE_RESOLVED",
      grievanceId: grievance.id,
      message: `${by} marked your grievance "${grievance.subject}" as resolved. Please confirm in Grievances → History.`,
    });
    emailComplainant(grievance, "RESOLVED", remark, by);

    return res.status(200).json({ message: "Marked resolved; waiting for the complainant to confirm", grievance: withComplainant(updated, false) });
  } catch (error: any) {
    logError("Resolve Grievance", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// PUT /api/grievances/:id/confirm   { resolved: boolean, reason? }
// The complainant confirms the resolution (the grievance closes and the chat ends), or
// says it is not resolved, with a reason that goes into the chat, and it stays open.
export const confirmResolution = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const resolved = req.body.resolved === true;
    const reason = String(req.body.reason || "").trim();

    const grievance = await prisma.grievance.findUnique({ where: { id: String(req.params.id) } });
    if (!grievance) return res.status(404).json({ error: "Grievance not found" });
    if (grievance.userId !== user.userId) return res.status(403).json({ error: "Only the person who raised the grievance can confirm it" });
    if (grievance.status === "CLOSED") return res.status(409).json({ error: "This grievance is already closed" });
    if (!grievance.resolvedAt) return res.status(400).json({ error: "The responder has not marked this grievance resolved yet" });

    const responder = grievance.assignedToId;
    if (resolved) {
      const updated = await prisma.grievance.update({
        where: { id: grievance.id },
        data: { status: "CLOSED", closedAt: new Date(), closedByName: grievance.resolvedByName },
        select: SAFE_FIELDS,
      });
      notify(responder ? "user" : "admins", responder, {
        type: "GRIEVANCE_CLOSED",
        grievanceId: grievance.id,
        message: `The complainant confirmed grievance ${grievance.referenceNo} is resolved. It is now closed.`,
      });
      emailComplainant(grievance, "CLOSED", grievance.remark || "", grievance.resolvedByName || "TNJA");
      return res.json({ message: "Thank you. Your grievance is now closed.", grievance: withComplainant(updated, false) });
    }

    if (!reason) return res.status(400).json({ error: "Tell the responder what is still not resolved" });
    if (reason.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: `Reason is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    const [, updated] = await prisma.$transaction([
      prisma.grievanceMessage.create({
        data: { grievanceId: grievance.id, senderType: "USER", message: `Not resolved yet: ${reason}` },
      }),
      prisma.grievance.update({
        where: { id: grievance.id },
        data: { resolvedAt: null, resolvedByName: null },
        select: SAFE_FIELDS,
      }),
    ]);
    notify(responder ? "user" : "admins", responder, {
      type: "GRIEVANCE_REOPENED",
      grievanceId: grievance.id,
      message: `The complainant says grievance ${grievance.referenceNo} is not resolved yet.`,
    });
    return res.json({ message: "Sent to the responder. The grievance stays open.", grievance: withComplainant(updated, false) });
  } catch (error: any) {
    logError("Confirm Resolution", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

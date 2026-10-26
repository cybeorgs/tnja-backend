import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import { getRazorpay, getRazorpayKeySecret, sendPaymentNotConfigured } from "../../config/razorpay.js";
import { recordCheckoutPayment } from "../payments/ledger.service.js";
import crypto from "crypto";
import { resolveMapLink } from "../../helpers/mapLink.helper.js";

const STATE_WIDE_ROLES = ["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY"];

/** Zone-level events must name a real zone (District.zoneName); below state level, only the user's own zone. */
async function checkEventZone(role: string, userDistrictId: string | null | undefined, zoneId: string): Promise<string | null> {
  const zoneExists = await prisma.district.findFirst({ where: { zoneName: zoneId }, select: { id: true } });
  if (!zoneExists) return `Unknown zone "${zoneId}"`;
  if (STATE_WIDE_ROLES.includes(role)) return null;
  const own = userDistrictId
    ? await prisma.district.findUnique({ where: { id: userDistrictId }, select: { zoneName: true } })
    : null;
  return own?.zoneName === zoneId ? null : `You can only hold zone events in your own zone${own?.zoneName ? ` (${own.zoneName})` : ""}`;
}

const ZONE_OFFICER_ROLES = ["ZONE_PRESIDENT", "ZONE_SECRETARY"];
const DISTRICT_OFFICER_ROLES = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"];

const zoneOfDistrict = async (districtId?: string | null) =>
  districtId ? (await prisma.district.findUnique({ where: { id: districtId }, select: { zoneName: true } }))?.zoneName ?? null : null;

/** District events: below state level, only the user's own district (zone officers: any district in their zone). */
async function checkEventDistrict(role: string, userDistrictId: string | null | undefined, districtId: string): Promise<string | null> {
  if (STATE_WIDE_ROLES.includes(role)) return null;
  if (ZONE_OFFICER_ROLES.includes(role)) {
    const [own, target] = await Promise.all([zoneOfDistrict(userDistrictId), zoneOfDistrict(districtId)]);
    return own && own === target ? null : "You can only hold district events in your own zone";
  }
  return districtId === userDistrictId ? null : "You can only hold district events in your own district";
}

/**
 * Who may edit an event: state-level roles, its creator, the district officers of a
 * district event's district and the zone officers of a zone event's zone — so a
 * district/zone event the Super Admin creates is handed to those officials only.
 */
async function canManageEvent(userId: string, role: string, userDistrictId: string | null | undefined, event: { createdBy: string; level: string; districtId: string | null; zoneId: string | null }) {
  if (STATE_WIDE_ROLES.includes(role) || event.createdBy === userId) return true;
  if (DISTRICT_OFFICER_ROLES.includes(role)) return event.level === "DISTRICT" && !!userDistrictId && event.districtId === userDistrictId;
  if (ZONE_OFFICER_ROLES.includes(role)) return event.level === "ZONE" && !!event.zoneId && event.zoneId === (await zoneOfDistrict(userDistrictId));
  return false;
}

const PARTICIPANT_TYPES = ["STUDENT", "COACH", "MEMBER", "CLUB"];
const EVENT_GENDERS = ["BOTH", "MALE", "FEMALE"];

/** Validates the date range and gender; returns the fields to save or an error. */
function resolveScheduleAndGender(date: unknown, endDate: unknown, gender: unknown) {
  const start = new Date(String(date));
  const end = endDate ? new Date(String(endDate)) : null;
  if (end && Number.isNaN(end.getTime())) return { error: "Invalid end date" };
  if (end && end < start) return { error: "End date cannot be before the from date" };
  const g = String(gender || "BOTH").toUpperCase();
  if (!EVENT_GENDERS.includes(g)) return { error: "Gender must be MALE, FEMALE or BOTH" };
  return { data: { endDate: end, gender: g } };
}

/**
 * Normalises the eligible groups from the request (participantTypes array, or the
 * older single participantType). Empty, "ALL", or every group means everyone.
 * Returns the list plus the single legacy value kept in participantType.
 */
function resolveParticipantTypes(participantTypes: unknown, participantType: unknown) {
  const raw = Array.isArray(participantTypes) ? participantTypes : participantType ? [participantType] : [];
  const picked = Array.from(new Set(raw.map((t) => String(t).toUpperCase()))).filter((t) => PARTICIPANT_TYPES.includes(t));
  const everyone = raw.some((t) => String(t).toUpperCase() === "ALL") || picked.length === 0 || picked.length === PARTICIPANT_TYPES.length;
  const list = everyone ? ["ALL"] : picked;
  return { participantTypes: list as any, participantType: (list.length === 1 ? list[0] : "ALL") as any };
}

export const createEvent = async (req: Request, res: Response) => {
  const { title, description, date, location, level, participantType, districtId, zoneId, isPaid, entryFee, meetingLink, bannerImage, participantTypes, endDate, gender, mapLink } = req.body;
  const { userId, role } = (req as any).user;

  try {
    // Only CLUB role or admin roles can propose events
    const adminRoles = ["SUPER_ADMIN", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "CEO"];
    if (role !== "CLUB" && !adminRoles.includes(role)) {
      return res.status(403).json({ error: "Only clubs or authorized admins can propose events" });
    }

    if (!title || !description || !date || !location || !level) {
      return res.status(400).json({ error: "Title, description, date, location, and level are required" });
    }

    const schedule = resolveScheduleAndGender(date, endDate, gender);
    if (schedule.error) return res.status(400).json({ error: schedule.error });
    const map = resolveMapLink(mapLink);
    if (map.error) return res.status(400).json({ error: map.error });

    // Validate level requirements
    if (level === "DISTRICT" && !districtId) {
      return res.status(400).json({ error: "District ID is required for district-level events" });
    }
    if (level === "DISTRICT") {
      const districtError = await checkEventDistrict(role, (req as any).user.districtId, districtId);
      if (districtError) return res.status(403).json({ error: districtError });
    }

    if (level === "ZONE" && !zoneId) {
      return res.status(400).json({ error: "Zone ID is required for zone-level events" });
    }

    if (level === "ZONE") {
      const zoneError = await checkEventZone(role, (req as any).user.districtId, zoneId);
      if (zoneError) return res.status(403).json({ error: zoneError });
    }

    const newEvent = await prisma.event.create({
      data: {
        title,
        description,
        date: new Date(date),
        location,
        level,
        ...resolveParticipantTypes(participantTypes, participantType),
        districtId: level === "DISTRICT" ? districtId : null,
        zoneId: level === "ZONE" ? zoneId : null,
        createdBy: userId,
        status: "PENDING",
        isPaid: !!isPaid,
        entryFee: isPaid ? Number(entryFee) || 0 : 0,
        meetingLink: meetingLink || null,
        eventSection: req.body.eventSection || null,
        bannerImage: bannerImage || null,
        ...schedule.data,
        mapLink: map.mapLink ?? null,
      },
    });

    return res.status(201).json({ message: "Event proposed successfully", event: newEvent });
  } catch (error) {
    console.error("Error creating event:", error);
    return res.status(500).json({ error: "Internal Server Error", ...(process.env.NODE_ENV !== "production" && { details: error instanceof Error ? error.message : String(error) }) });
  }
};

export const getActiveEvents = async (req: Request, res: Response) => {
  try {
    const { role, userId } = (req as any).user || { role: "GUEST" };
    
    // Map the user's role to the participant type
    let targetParticipant = "ALL";
    if (role === "STUDENT" || role === "PLAYER") targetParticipant = "STUDENT";
    else if (role === "COACH") targetParticipant = "COACH";
    else if (role === "CLUB") targetParticipant = "CLUB";
    else if (role === "MEMBER") targetParticipant = "MEMBER";

    // Fetch the user's district and zone name
    let userDistrict: any = null;
    let userGender: string | null = null;
    if (userId) {
      let userDetails: any = null;
      if (role === "STUDENT" || role === "PLAYER") {
        userDetails = await prisma.student.findUnique({ where: { id: userId }, include: { district: true } });
      } else if (role === "COACH" || (req as any).user?.accountType === "COACH") {
        userDetails = await prisma.coachReferee.findUnique({ where: { id: userId }, include: { district: true } });
      } else if (role === "CLUB") {
        userDetails = await prisma.club.findUnique({ where: { id: userId }, include: { district: true } });
      } else {
        userDetails = await prisma.member.findUnique({ where: { id: userId }, include: { district: true } });
      }
      userDistrict = userDetails?.district || null;
      userGender = userDetails?.gender ?? null;
    }

    const isAdmin = ["SUPER_ADMIN", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "CEO"].includes(role);
    const whereClause: any = { status: "APPROVED" };

    if (!isAdmin) {
      const geoConditions: any = userDistrict
        ? [
            { level: { in: ["STATE", "NATIONAL"] } },
            { AND: [{ level: "DISTRICT" }, { districtId: userDistrict.id }] },
            { AND: [{ level: "ZONE" }, { zoneId: userDistrict.zoneName }] }
          ]
        : [{ level: { in: ["STATE", "NATIONAL"] } }];

      whereClause.OR = [
        {
          AND: [
            { participantTypes: { hasSome: ["ALL", targetParticipant] as any } },
            // Gender-restricted events only reach people of that gender (clubs have none, so see all).
            ...(userGender === "MALE" || userGender === "FEMALE" ? [{ gender: { in: ["BOTH", userGender] } }] : []),
            { OR: geoConditions }
          ]
        },
        { createdBy: userId || "" }
      ];
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: { 
        district: { select: { name: true } },
        registrations: {
          where: { userId: userId || "" }
        }
      },
      orderBy: { date: "asc" },
    });
    return res.json(events);
  } catch (error) {
    console.error("Error fetching active events:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getMyEvents = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const events = await prisma.event.findMany({
      where: { createdBy: userId },
      include: {
        district: { select: { name: true } },
        registrations: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(events);
  } catch (error) {
    console.error("Error fetching user's events:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    const eventId = req.params.id as string;
    const { title, description, date, location, level, participantType, districtId, zoneId, isPaid, entryFee, meetingLink, eventSection, bannerImage, participantTypes, endDate, gender, mapLink } = req.body;
    const { userId, role } = (req as any).user;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const userDistrictId = (req as any).user.districtId;
    if (!(await canManageEvent(userId, role, userDistrictId, event))) {
      return res.status(403).json({ error: "Unauthorized to edit this event" });
    }
    if (level === "DISTRICT" && districtId) {
      const districtError = await checkEventDistrict(role, userDistrictId, districtId);
      if (districtError) return res.status(403).json({ error: districtError });
    }

    const updateData: any = {
      title,
      description,
      date: new Date(date),
      location,
      level,
      ...resolveParticipantTypes(participantTypes, participantType),
      isPaid: !!isPaid,
      entryFee: isPaid ? Number(entryFee) || 0 : 0,
      meetingLink: meetingLink || null,
      eventSection: eventSection || null,
      bannerImage: bannerImage || null,
    };

    const schedule = resolveScheduleAndGender(date, endDate, gender);
    if (schedule.error) return res.status(400).json({ error: schedule.error });
    Object.assign(updateData, schedule.data);
    const map = resolveMapLink(mapLink);
    if (map.error) return res.status(400).json({ error: map.error });
    if (map.mapLink !== undefined) updateData.mapLink = map.mapLink;

    if (level === "DISTRICT") {
      updateData.districtId = districtId;
      updateData.zoneId = null;
    } else if (level === "ZONE") {
      const zoneError = zoneId ? await checkEventZone(role, (req as any).user.districtId, zoneId) : "Zone ID is required for zone-level events";
      if (zoneError) return res.status(403).json({ error: zoneError });
      updateData.districtId = null;
      updateData.zoneId = zoneId;
    } else {
      updateData.districtId = null;
      updateData.zoneId = null;
    }

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });

    return res.json({ message: "Event updated successfully", event: updatedEvent });
  } catch (error) {
    console.error("Error updating event:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getAdminEvents = async (req: Request, res: Response) => {
  try {
    const { role, districtId } = (req as any).user;
    const eventWhere: any = {};

    // Apply role-based scope
    if (["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role)) {
      eventWhere.level = "DISTRICT";
      if (districtId) {
        eventWhere.districtId = districtId;
      }
    } else if (["ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role)) {
      eventWhere.level = "ZONE";
      if (districtId) {
        // Zone events store the zone name as zoneId; the officer's zone is their district's zoneName.
        const officerDistrict = await prisma.district.findUnique({ where: { id: districtId }, select: { zoneName: true } });
        if (officerDistrict?.zoneName) eventWhere.zoneId = officerDistrict.zoneName;
      }
    }

    const events = await prisma.event.findMany({
      where: eventWhere,
      include: { district: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json(events);
  } catch (error) {
    console.error("Error fetching admin events:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const applyForEvent = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.body;
    const { userId, role } = (req as any).user;

    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required" });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId
        }
      }
    });

    if (existingRegistration) {
      return res.status(400).json({ error: "You have already applied for this event" });
    }

    const registration = await prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        role,
        status: "APPROVED"
      }
    });

    return res.status(201).json({ message: "Successfully applied for event", registration });
  } catch (error) {
    console.error("Error applying for event:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * GET /announcements – public list of upcoming approved tournaments and events for the
 * homepage ticker. Only titles and dates are exposed.
 */
export const getPublicAnnouncements = async (_req: Request, res: Response) => {
  try {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    const [tournaments, events] = await Promise.all([
      prisma.tournament.findMany({
        where: { status: "APPROVED", date: { gte: today } },
        select: { title: true, date: true },
        orderBy: { date: "asc" },
        take: 8,
      }),
      prisma.event.findMany({
        where: { status: "APPROVED", date: { gte: today } },
        select: { title: true, date: true },
        orderBy: { date: "asc" },
        take: 8,
      }),
    ]);
    const items = [...tournaments, ...events]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 8)
      .map((item) => ({ title: item.title, date: item.date.toISOString() }));
    return res.json(items);
  } catch (error) {
    console.error("[getPublicAnnouncements]", error);
    return res.status(500).json({ error: "Failed to load announcements" });
  }
};

export const createEventPaymentOrder = async (req: Request, res: Response) => {
  const { eventId } = req.body;
  const { userId } = (req as any).user;

  try {
    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required" });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (!event.isPaid) {
      return res.status(400).json({ error: "This event is free, no payment required" });
    }

    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    if (existingRegistration) {
      return res.status(400).json({ error: "You have already applied for this event" });
    }

    const receiptId = `evt_${eventId.substring(0, 10)}_${userId.substring(0, 10)}`;
    const options = {
      amount: Math.round(event.entryFee * 100), // amount in paise
      currency: "INR",
      receipt: receiptId,
    };

    const razorpay = getRazorpay();
    if (!razorpay) return sendPaymentNotConfigured(res);

    const order = await razorpay.orders.create(options);
    return res.json(order);
  } catch (error) {
    console.error("Error creating event payment order:", error);
    return res.status(500).json({ error: "Failed to create payment order" });
  }
};

export const verifyEventPayment = async (req: Request, res: Response) => {
  const { eventId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  const { userId, role } = (req as any).user;

  try {
    if (!eventId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required payment fields" });
    }

    // Verify signature
    const keySecret = getRazorpayKeySecret();
    if (!keySecret) return sendPaymentNotConfigured(res);
    const hmac = crypto.createHmac("sha256", keySecret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check existing registration
    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    if (existingRegistration) {
      return res.status(400).json({ error: "Already registered for this event" });
    }

    // Create the registration as APPROVED
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        role,
        status: "APPROVED",
      },
    });

    // Send confirmation email with receipt
    let userDetails: any = null;
    if (role === "STUDENT" || role === "PLAYER") {
      userDetails = await prisma.student.findUnique({ where: { id: userId } });
    } else if (role === "COACH" || (req as any).user?.accountType === "COACH") {
      userDetails = await prisma.coachReferee.findUnique({ where: { id: userId } });
    } else if (role === "CLUB") {
      userDetails = await prisma.club.findUnique({ where: { id: userId } });
    } else {
      userDetails = await prisma.member.findUnique({ where: { id: userId } });
    }

    await recordCheckoutPayment({
      purpose: "EVENT",
      payerType: role === "STUDENT" ? "PLAYER" : role,
      payerId: userId,
      payerName: userDetails?.fullName || userDetails?.name || null,
      referenceId: event.id,
      referenceTitle: event.title,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      expectedPaise: Math.round(event.entryFee * 100),
    });

    if (userDetails) {
      try {
        const { sendEventRegistrationEmail } = await import("../../config/mailer.js");
        await sendEventRegistrationEmail({
          toEmail: userDetails.email,
          toName: userDetails.fullName || userDetails.name,
          eventName: event.title,
          eventDate: new Date(event.date).toLocaleDateString("en-IN"),
          eventLocation: event.location,
          amountPaid: event.entryFee,
          paymentId: razorpay_payment_id,
        });
      } catch (mailErr) {
        console.error("Error sending event registration email:", mailErr);
      }
    }

    return res.status(201).json({ message: "Payment verified & applied for event successfully", registration });
  } catch (error) {
    console.error("Error verifying event payment:", error);
    return res.status(500).json({ error: "Payment verification failed" });
  }
};

export const getEventSections = async (req: Request, res: Response) => {
  try {
    const sections = [
      { name: "Skill test" },
      { name: "Meeting" },
      { name: "Seminar" },
      { name: "Training camp" },
      { name: "Sport's event" },
      { name: "Charity event" },
      { name: "Contest" },
      { name: "Seminar (Online)" },
      { name: "Conference" },
      { name: "Challenge" }
    ];
    return res.json(sections);
  } catch (error) {
    console.error("Error fetching event sections:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

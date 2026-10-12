import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export const createEvent = async (req: Request, res: Response) => {
  const { title, description, date, location, level, participantType, districtId, zoneId, isPaid, entryFee, meetingLink } = req.body;
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

    // Validate level requirements
    if (level === "DISTRICT" && !districtId) {
      return res.status(400).json({ error: "District ID is required for district-level events" });
    }

    if (level === "ZONE" && !zoneId) {
      return res.status(400).json({ error: "Zone ID is required for zone-level events" });
    }

    const newEvent = await prisma.event.create({
      data: {
        title,
        description,
        date: new Date(date),
        location,
        level,
        participantType: participantType || "ALL",
        districtId: level === "DISTRICT" ? districtId : null,
        zoneId: level === "ZONE" ? zoneId : null,
        createdBy: userId,
        status: "PENDING",
        isPaid: !!isPaid,
        entryFee: isPaid ? Number(entryFee) || 0 : 0,
        meetingLink: meetingLink || null,
        eventSection: req.body.eventSection || null,
      },
    });

    return res.status(201).json({ message: "Event proposed successfully", event: newEvent });
  } catch (error) {
    console.error("Error creating event:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) });
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
    if (userId) {
      let userDetails: any = null;
      if (role === "STUDENT" || role === "PLAYER") {
        userDetails = await prisma.student.findUnique({ where: { id: userId }, include: { district: true } });
      } else if (role === "COACH") {
        userDetails = await prisma.coachReferee.findUnique({ where: { id: userId }, include: { district: true } });
      } else if (role === "CLUB") {
        userDetails = await prisma.club.findUnique({ where: { id: userId }, include: { district: true } });
      } else {
        userDetails = await prisma.member.findUnique({ where: { id: userId }, include: { district: true } });
      }
      userDistrict = userDetails?.district || null;
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
            { participantType: { in: ["ALL", targetParticipant] as any } },
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
    const { title, description, date, location, level, participantType, districtId, zoneId, isPaid, entryFee, meetingLink, eventSection } = req.body;
    const { userId, role } = (req as any).user;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const adminRoles = ["SUPER_ADMIN", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "CEO"];
    const isAdmin = adminRoles.includes(role);

    if (event.createdBy !== userId && !isAdmin) {
      return res.status(403).json({ error: "Unauthorized to edit this event" });
    }

    const updateData: any = {
      title,
      description,
      date: new Date(date),
      location,
      level,
      participantType,
      isPaid: !!isPaid,
      entryFee: isPaid ? Number(entryFee) || 0 : 0,
      meetingLink: meetingLink || null,
      eventSection: eventSection || null,
    };

    if (level === "DISTRICT") {
      updateData.districtId = districtId;
      updateData.zoneId = null;
    } else if (level === "ZONE") {
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
        // Here, we use the user's districtId to find their zone, but zoneId isn't on the user. 
        // We will assume the user has a zoneId or their district maps to a zone. 
        // For now, if zoneId is stored in districtId claim, we use it. 
        eventWhere.zoneId = districtId;
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
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "");
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
    } else if (role === "COACH") {
      userDetails = await prisma.coachReferee.findUnique({ where: { id: userId } });
    } else if (role === "CLUB") {
      userDetails = await prisma.club.findUnique({ where: { id: userId } });
    } else {
      userDetails = await prisma.member.findUnique({ where: { id: userId } });
    }

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

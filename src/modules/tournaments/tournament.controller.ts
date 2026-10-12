import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import fs from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { sendNotificationToUser } from "../../socket/socket.js";
import { sendEventRegistrationEmail, sendNewTournamentAnnouncement } from "../../config/mailer.js";

export const getEligibleCategoriesByBirthYear = (birthYear: number): string[] => {
  const eligible: string[] = [];
  if (birthYear === 2018 || birthYear === 2019) eligible.push("Mini Sub-Junior Age Group 1");
  if (birthYear === 2016 || birthYear === 2017) eligible.push("Mini Sub-Junior Age Group 2");
  if (birthYear === 2014 || birthYear === 2015) eligible.push("Mini Sub-Junior Age Group 3");
  if (birthYear >= 2011 && birthYear <= 2013) eligible.push("Sub-Junior");
  if (birthYear >= 2008 && birthYear <= 2010) eligible.push("Cadet");
  if (birthYear >= 2005 && birthYear <= 2010) eligible.push("Junior");
  if (birthYear <= 2010) eligible.push("Senior");
  
  const currentYear = new Date().getFullYear();
  if (currentYear - birthYear >= 35) eligible.push("Veteran");
  
  return eligible;
};

// ─── HELPER: Calculate Age Group ────────────────────────────────────────────
export const getAgeGroup = (dob: Date | null, category?: string): string => {
  if (!dob) return category || "Senior"; // Fallback
  const birthYear = dob.getFullYear();
  const eligible = getEligibleCategoriesByBirthYear(birthYear);
  
  if (category && eligible.includes(category)) {
    return category;
  }
  
  return eligible.length > 0 ? (eligible[0] as string) : "Senior";
};

// ─── HELPER: Get Weight Category ────────────────────────────────────────────
export const getWeightCategory = (weightKg: number, gender: string, ageGroup: string): string => {
  const w = weightKg;
  const isMale = gender === "MALE";

  if (ageGroup.includes("Age Group 1")) {
    if (isMale) {
      if (w <= 20) return "-20kg";
      if (w <= 25) return "-25kg";
      if (w <= 30) return "-30kg";
      return "+30kg";
    } else {
      if (w <= 18) return "-18kg";
      if (w <= 22) return "-22kg";
      if (w <= 26) return "-26kg";
      return "+26kg";
    }
  }

  if (ageGroup.includes("Age Group 2")) {
    if (isMale) {
      if (w <= 25) return "-25kg";
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      return "+35kg";
    } else {
      if (w <= 22) return "-22kg";
      if (w <= 26) return "-26kg";
      if (w <= 30) return "-30kg";
      return "+30kg";
    }
  }

  if (ageGroup.includes("Age Group 3")) {
    if (isMale) {
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      if (w <= 40) return "-40kg";
      if (w <= 45) return "-45kg";
      return "+45kg";
    } else {
      if (w <= 28) return "-28kg";
      if (w <= 32) return "-32kg";
      if (w <= 36) return "-36kg";
      if (w <= 40) return "-40kg";
      return "+40kg";
    }
  }

  if (ageGroup.includes("Sub-Junior")) {
    if (isMale) {
      if (w <= 30) return "-30kg";
      if (w <= 35) return "-35kg";
      if (w <= 40) return "-40kg";
      if (w <= 45) return "-45kg";
      if (w <= 50) return "-50kg";
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      return "+66kg";
    } else {
      if (w <= 28) return "-28kg";
      if (w <= 32) return "-32kg";
      if (w <= 36) return "-36kg";
      if (w <= 40) return "-40kg";
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      return "+57kg";
    }
  }

  if (ageGroup.includes("Cadet")) {
    if (isMale) {
      if (w <= 50) return "-50kg";
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      if (w <= 73) return "-73kg";
      if (w <= 81) return "-81kg";
      if (w <= 90) return "-90kg";
      return "+90kg";
    } else {
      if (w <= 40) return "-40kg";
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      if (w <= 63) return "-63kg";
      if (w <= 70) return "-70kg";
      return "+70kg";
    }
  }

  if (ageGroup.includes("Junior")) {
    if (isMale) {
      if (w <= 55) return "-55kg";
      if (w <= 60) return "-60kg";
      if (w <= 66) return "-66kg";
      if (w <= 73) return "-73kg";
      if (w <= 81) return "-81kg";
      if (w <= 90) return "-90kg";
      if (w <= 100) return "-100kg";
      return "+100kg";
    } else {
      if (w <= 44) return "-44kg";
      if (w <= 48) return "-48kg";
      if (w <= 52) return "-52kg";
      if (w <= 57) return "-57kg";
      if (w <= 63) return "-63kg";
      if (w <= 70) return "-70kg";
      if (w <= 78) return "-78kg";
      return "+78kg";
    }
  }

  // Senior / Veteran
  if (isMale) {
    if (w <= 60) return "-60kg";
    if (w <= 66) return "-66kg";
    if (w <= 73) return "-73kg";
    if (w <= 81) return "-81kg";
    if (w <= 90) return "-90kg";
    if (w <= 100) return "-100kg";
    return "+100kg";
  } else {
    if (w <= 48) return "-48kg";
    if (w <= 52) return "-52kg";
    if (w <= 57) return "-57kg";
    if (w <= 63) return "-63kg";
    if (w <= 70) return "-70kg";
    if (w <= 78) return "-78kg";
    return "+78kg";
  }
};

// ─── HELPER: Create or Get Tournament Draw ──────────────────────────────────
const createOrGetDraw = async (tournamentId: string, gender: string, ageGroup: string, weightCategory: string, exactAge: number = 0) => {
  try {
    const draw = await prisma.tournamentDraw.upsert({
      where: {
        tournamentId_ageGroup_exactAge_gender_weightCategory: {
          tournamentId,
          ageGroup,
          exactAge,
          gender,
          weightCategory,
        },
      },
      update: {}, // No update needed, just get existing
      create: {
        tournamentId,
        ageGroup,
        exactAge,
        gender,
        weightCategory,
        rounds: { participants: [] }, // Initialize empty rounds
      },
    });
    return draw;
  } catch (error) {
    console.error("Error creating/getting draw:", error);
    return null;
  }
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

// ─── CLUB: Create Tournament ─────────────────────────────────────────────────
export const createTournament = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Only clubs or authorized officials can create tournaments" });
  }

  const { title, dateFrom, dateTo, location, description, entryFee, numberOfMats, ageFrom, ageTo, category, gender, allowBPL, beltEligibility, bannerImage, level, zoneId } = req.body;

  if (!title || !dateFrom || !location || !description || entryFee === undefined || !level) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  try {
    // Initial approval setup based on level
    let districtApproval = level === "NATIONAL" ? "PENDING" : "APPROVED";
    let stateApproval = ["NATIONAL", "STATE", "ZONE", "DISTRICT"].includes(level) ? "PENDING" : "APPROVED";
    let superAdminApproval = "PENDING";
    let ceoApproval = ["NATIONAL", "STATE", "ZONE"].includes(level) ? "PENDING" : "NOT_REQUIRED";
    let initialStatus = "PENDING";

    if (isOfficial) {
      if (role === "STATE_PRESIDENT" || role === "STATE_SECRETARY" || role === "CEO" || role === "SUPER_ADMIN") {
        districtApproval = "NOT_REQUIRED";
        stateApproval = "NOT_REQUIRED";
      } else if (role === "DISTRICT_PRESIDENT" || role === "DISTRICT_SECRETARY" || role === "ZONE_PRESIDENT" || role === "ZONE_SECRETARY") {
        districtApproval = "NOT_REQUIRED";
        // stateApproval remains PENDING
      }

      // Super Admin sits above the approval chain — their own tournaments
      // shouldn't wait in their own (or anyone else's) approval queue.
      if (role === "SUPER_ADMIN") {
        districtApproval = "APPROVED";
        stateApproval = "APPROVED";
        superAdminApproval = "APPROVED";
        ceoApproval = "APPROVED";
        initialStatus = "APPROVED";
      }
    }

    const tournament = await prisma.tournament.create({
      data: {
        title,
        date: new Date(dateFrom),
        dateTo: dateTo ? new Date(dateTo) : null,
        location,
        description,
        entryFee: Number(entryFee),
        numberOfMats: numberOfMats ? Number(numberOfMats) : 1,
        ageFrom: Number(ageFrom || 0),
        ageTo: Number(ageTo || 100),
        category: category || null,
        gender: gender || "BOTH",
        allowBPL: Boolean(allowBPL),
        beltEligibility: beltEligibility || null,
        bannerImage: bannerImage || null,
        level,
        zoneId: zoneId || null,
        clubId: isClub ? userId : null,
        officialId: (isOfficial && role !== "SUPER_ADMIN") ? userId : null,
        status: initialStatus as any,
        districtApproval: districtApproval as any,
        stateApproval: stateApproval as any,
        superAdminApproval: superAdminApproval as any,
        ceoApproval: ceoApproval as any,
      },
    });

    if (isClub) {
      // Notify all paid players of this club who are currently online
      const paidPlayers = await prisma.student.findMany({
        where: { clubId: userId, isPaid: true, status: "APPROVED" },
        select: { id: true, fullName: true },
      });

      for (const player of paidPlayers) {
        sendNotificationToUser(player.id, {
          type: "NEW_TOURNAMENT",
          message: `Your club has proposed a new tournament: "${title}" on ${new Date(dateFrom).toLocaleDateString("en-IN")}. It is currently waiting for approvals.`,
          tournamentId: tournament.id,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return res.status(201).json({ message: "Tournament created successfully", tournament });
  } catch (error) {
    console.error("Error creating tournament:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── START TOURNAMENT (Close Registrations) ──────────────────────────────────
export const startTournament = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const isCreator = tournament.clubId === userId || tournament.officialId === userId;
    const isOfficial = ["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role);

    if (!isCreator && !isOfficial) {
      return res.status(403).json({ error: "You don't have permission to start this tournament" });
    }

    const updated = await prisma.tournament.update({
      where: { id },
      data: { registrationClosed: true }
    });

    return res.json({ message: "Tournament started successfully", tournament: updated });
  } catch (error) {
    console.error("Error starting tournament:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Get My Tournaments ────────────────────────────────────────────────
export const getClubTournaments = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const whereClause = isClub 
      ? { clubId: userId } 
      : (role === "SUPER_ADMIN" ? { officialId: null, clubId: null } : { officialId: userId });

    const tournaments = await prisma.tournament.findMany({
      where: whereClause,
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { status: "PENDING" }, select: { id: true }, take: 1 }
      },
      orderBy: { date: "asc" },
    });

    const result = tournaments.map((t: any) => ({
      ...t,
      registrationCount: t._count.registrations,
      hasPendingPlayers: t.registrations.length > 0,
      registrations: undefined,
      _count: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching club tournaments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Get All Approved Tournaments ──────────────────────────────────────
export const getApprovedTournaments = async (req: Request, res: Response) => {
  const { role } = (req as any).user;

  if (role !== "CLUB") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: "APPROVED" },
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
        club: { select: { name: true, district: { select: { name: true } } } }
      },
      orderBy: { date: "desc" },
    });

    const result = tournaments.map((t: any) => ({
      ...t,
      registrationCount: t._count.registrations,
      hasPendingPlayers: t.registrations.length > 0,
      registrations: undefined,
      _count: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching approved tournaments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Get Registrations for a Tournament ────────────────────────────────
export const getTournamentRegistrations = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (!isOfficial && tournament.clubId !== userId && tournament.officialId !== userId) {
      return res.status(403).json({ error: "This tournament does not belong to you" });
    }

    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: id },
      include: {
        player: {
          select: { id: true, fullName: true, permanentId: true, tempId: true, email: true, gender: true, age: true, dob: true, belt: true, club: { select: { id: true, name: true } }, district: { select: { name: true } } },
        },
        coach: { select: { id: true, fullName: true } }
      },
      orderBy: { createdAt: "asc" },
    });

    const formattedRegistrations = registrations.map((reg: any) => ({
      ...reg,
      ageGroup: reg.ageGroup || reg.ageGroup || getAgeGroup(reg.player.dob)
    }));

    return res.json(formattedRegistrations);
  } catch (error) {
    console.error("Error fetching tournament registrations:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Get Messages for a Registration ───────────────────────────────────
export const getRegistrationMessages = async (req: Request, res: Response) => {
  const regId = req.params.regId as string;
  try {
    const messages = await prisma.tournamentRegistrationMessage.findMany({
      where: { registrationId: regId },
      orderBy: { createdAt: "asc" },
    });
    return res.json(messages);
  } catch (error) {
    console.error("Error fetching registration messages:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Approve or Reject a Registration ──────────────────────────────────
export const updateRegistrationStatus = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const tournamentId = req.params.id as string;
  const regId = req.params.regId as string;
  const { status, message } = req.body;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) return res.status(403).json({ error: "This tournament does not belong to you" });

    const existingRegistration = await prisma.tournamentRegistration.findUnique({
      where: { id: regId },
      include: { player: { select: { id: true, fullName: true, email: true } } },
    });
    
    if (!existingRegistration) return res.status(404).json({ error: "Registration not found" });
    if (existingRegistration.status === status) {
      return res.json({ message: `Registration is already ${status.toLowerCase()}`, registration: existingRegistration });
    }

    const registration = await prisma.tournamentRegistration.update({
      where: { id: regId },
      data: { status },
      include: { player: { select: { id: true, fullName: true, email: true } } },
    });

    const defaultNotificationMsg = status === "APPROVED"
      ? `Your registration for "${tournament.title}" has been approved by the club!`
      : `Your registration for "${tournament.title}" has been rejected by the club.`;

    const defaultChatMsg = status === "APPROVED"
      ? `Registration Approved.`
      : `Registration Rejected.`;

    const finalNotificationMsg = message?.trim() || defaultNotificationMsg;
    const finalChatMsg = message?.trim() || defaultChatMsg;

    // Save message to DB as a chat record
    await prisma.tournamentRegistrationMessage.create({
      data: {
        registrationId: regId,
        senderRole: role,
        senderName: "Club",
        message: `[${status}] ${finalChatMsg}`,
      },
    });

    sendNotificationToUser(registration.playerId, {
      type: "TOURNAMENT_REG_UPDATE",
      message: finalNotificationMsg,
      tournamentId,
      createdAt: new Date().toISOString(),
    });

    if (status === "APPROVED" && registration.player.email) {
      try {
        await sendEventRegistrationEmail({
          toEmail: registration.player.email,
          toName: registration.player.fullName,
          eventName: tournament.title,
          eventDate: new Date(tournament.date).toLocaleDateString("en-IN"),
          eventLocation: tournament.location,
          amountPaid: tournament.entryFee,
          paymentId: registration.paymentId || "Free/BPL Registration",
        });
      } catch (err) {
        console.error("Failed to send approval email:", err);
      }
    }

    return res.json({ message: `Registration ${status.toLowerCase()} successfully`, registration });
  } catch (error) {
    console.error("Error updating registration status:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const disqualifyRegistration = async (req: Request, res: Response) => {
  const regId = req.params.regId as string;
  const { currentWeight } = req.body;
  const { userId, role } = (req as any).user;

  try {
    const registration = await prisma.tournamentRegistration.findUnique({
      where: { id: regId },
      include: { tournament: true, player: true },
    });

    if (!registration) return res.status(404).json({ error: "Registration not found" });
    if (registration.tournament.clubId !== userId && registration.tournament.officialId !== userId && role !== "SUPER_ADMIN" && role !== "CEO") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Add a message about the disqualification
    await prisma.tournamentRegistrationMessage.create({
      data: {
        registrationId: regId,
        senderRole: "SYSTEM",
        senderName: "Tournament Admin",
        message: `Player was disqualified. Actual weigh-in weight: ${currentWeight}kg.`,
      }
    });

    const updated = await prisma.tournamentRegistration.update({
      where: { id: regId },
      data: { status: "DISQUALIFIED" },
    });

    return res.json({ message: "Player disqualified", registration: updated });
  } catch (error) {
    console.error("Error disqualifying registration:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB/OFFICIAL: Update Registration Metrics (Weight/Height) ───────────────
export const updateRegistrationMetrics = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const tournamentId = req.params.id as string;
  const regId = req.params.regId as string;
  const { weight, height, belt, clubId, coachId, ageGroup } = req.body;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) {
      return res.status(403).json({ error: "This tournament does not belong to you" });
    }

    if (tournament.status === "CLOSED") {
      return res.status(400).json({ error: "Cannot edit metrics for a completed tournament" });
    }

    const registration = await prisma.tournamentRegistration.findUnique({
      where: { id: regId },
      include: { player: { select: { gender: true } } },
    });

    if (!registration) return res.status(404).json({ error: "Registration not found" });

    const effectiveWeight = weight || registration.weight;
    const effectiveAgeGroup = ageGroup || registration.ageGroup;
    const weightCategory = effectiveWeight
      ? getWeightCategory(Number(effectiveWeight), registration.player.gender, effectiveAgeGroup)
      : registration.weightCategory;

    const updatedRegistration = await prisma.tournamentRegistration.update({
      where: { id: regId },
      data: {
        weight: weight || registration.weight,
        height: height || registration.height,
        belt: belt !== undefined ? belt : registration.belt,
        ageGroup: effectiveAgeGroup,
        weightCategory,
        coachId: coachId !== undefined ? (coachId || null) : registration.coachId,
      },
    });

    if (weight || height || belt !== undefined || clubId !== undefined || coachId !== undefined) {
      await prisma.student.update({
        where: { id: registration.playerId },
        data: {
          ...(weight && { weight }),
          ...(height && { height }),
          ...(belt !== undefined && { belt }),
          ...(clubId !== undefined && { clubId: clubId || null }),
          ...(coachId !== undefined && { coachId: coachId || null }),
        }
      });
    }

    return res.json({ message: "Metrics updated successfully", registration: updatedRegistration });
  } catch (error) {
    console.error("Error updating registration metrics:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Send Reply to a Player Registration ───────────────────────────────
export const sendRegistrationReply = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const tournamentId = req.params.id as string;
  const regId = req.params.regId as string;
  const { message } = req.body;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) return res.status(403).json({ error: "Access denied" });
  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) return res.status(403).json({ error: "This tournament does not belong to you" });

    const registration = await prisma.tournamentRegistration.findUnique({
      where: { id: regId },
      select: { playerId: true },
    });
    if (!registration) return res.status(404).json({ error: "Registration not found" });

    // Save to DB
    await prisma.tournamentRegistrationMessage.create({
      data: {
        registrationId: regId,
        senderRole: role,
        senderName: "Club",
        message: message.trim(),
      },
    });

    sendNotificationToUser(registration.playerId, {
      type: "TOURNAMENT_REG_UPDATE",
      message: message.trim(),
      tournamentId,
      createdAt: new Date().toISOString(),
    });

    return res.json({ message: "Reply sent successfully" });
  } catch (error) {
    console.error("Error sending registration reply:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Update Tournament ─────────────────────────────────────────────────
export const updateTournament = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Only clubs and officials can update tournaments" });
  }

  const { title, dateFrom, dateTo, location, description, entryFee, numberOfMats, ageFrom, ageTo, category, gender, allowBPL, beltEligibility, bannerImage, level, zoneId } = req.body;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) return res.status(403).json({ error: "This tournament does not belong to you" });

    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(dateFrom && { date: new Date(dateFrom) }),
        ...(dateTo !== undefined && { dateTo: dateTo ? new Date(dateTo) : null }),
        ...(location && { location }),
        ...(description && { description }),
        ...(entryFee !== undefined && { entryFee: Number(entryFee) }),
        ...(numberOfMats !== undefined && { numberOfMats: Number(numberOfMats) }),
        ...(ageFrom !== undefined && { ageFrom: Number(ageFrom) }),
        ...(ageTo !== undefined && { ageTo: Number(ageTo) }),
        ...(category !== undefined && { category }),
        ...(gender && { gender }),
        ...(allowBPL !== undefined && { allowBPL: Boolean(allowBPL) }),
        ...(beltEligibility !== undefined && { beltEligibility }),
        ...(bannerImage !== undefined && { bannerImage }),
        ...(level && { level }),
        ...(zoneId !== undefined && { zoneId }),
      },
    });

    return res.json({ message: "Tournament updated successfully", tournament: updated });
  } catch (error) {
    console.error("Error updating tournament:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CLUB: Delete Tournament ──────────────────────────────────────────────────
export const deleteTournament = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Only clubs and officials can delete tournaments" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) return res.status(403).json({ error: "This tournament does not belong to you" });

    // Delete registrations first (FK constraint)
    await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
    await prisma.tournament.delete({ where: { id } });

    return res.json({ message: "Tournament deleted successfully" });
  } catch (error) {
    console.error("Error deleting tournament:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── PLAYER: Get Club Tournaments ────────────────────────────────────────────
export const getPlayerTournaments = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;

  if (role !== "PLAYER" && role !== "STUDENT") {
    return res.status(403).json({ error: "Only players can access this endpoint" });
  }

  try {
    const player = await prisma.student.findUnique({
      where: { id: userId },
      select: { clubId: true, isPaid: true, isBPL: true },
    });

    if (!player) return res.status(404).json({ error: "Player not found" });
    if (!player.clubId) return res.json([]); // Player not linked to a club

    const tournaments = await prisma.tournament.findMany({
      where: { clubId: player.clubId, status: { in: ["APPROVED", "CLOSED"] } },
      include: {
        _count: { select: { registrations: true } },
        registrations: {
          where: { playerId: userId },
          select: { id: true, status: true, isPaid: true, placement: true, ageGroup: true, weightCategory: true, gender: true },
        },
      },
      orderBy: { date: "desc" },
    });

    const concludedDraws = await prisma.tournamentDraw.findMany({
      where: {
        tournamentId: { in: tournaments.map((t: any) => t.id) },
        isConcluded: true
      },
      select: {
        tournamentId: true,
        ageGroup: true,
        gender: true,
        weightCategory: true
      }
    });

    const concludedDrawsSet = new Set(
      concludedDraws.map((d: any) => `${d.tournamentId}_${d.ageGroup}_${d.gender}_${d.weightCategory}`)
    );

    const result = tournaments.map((t: any) => {
      const myReg = t.registrations[0] || null;
      let isCategoryConcluded = false;
      if (myReg) {
        const drawKey = `${t.id}_${myReg.ageGroup}_${myReg.gender}_${myReg.weightCategory}`;
        isCategoryConcluded = concludedDrawsSet.has(drawKey);
      }

      return {
        ...t,
        registrationCount: t._count.registrations,
        myRegistration: myReg ? {
          ...myReg,
          isCategoryConcluded
        } : null,
      myRegistrations: t.registrations || [],
        registrations: undefined,
        _count: undefined,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("Error fetching player tournaments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── PLAYER: Get Category Participants ───────────────────────────────────────
export const getCategoryParticipants = async (req: Request, res: Response) => {
  const { tournamentId, ageGroup, gender, weightCategory } = req.query;

  if (!tournamentId || !ageGroup || !gender || !weightCategory) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  try {
    const participants = await prisma.tournamentRegistration.findMany({
      where: {
        tournamentId: tournamentId as string,
        ageGroup: ageGroup as string,
        gender: gender as any,
        weightCategory: weightCategory as string,
        status: "APPROVED"
      },
      include: {
        player: { select: { fullName: true, club: { select: { name: true } }, district: { select: { name: true } } } }
      },
      orderBy: { player: { fullName: "asc" } }
    });

    const formatted = participants.map((p: any) => ({
      id: p.id,
      name: p.player?.fullName || "Unknown",
      club: p.player?.club?.name || "-",
      district: p.player?.district?.name || "-"
    }));

    return res.json(formatted);
  } catch (error) {
    console.error("Error fetching category participants:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── PLAYER: Get District / State / National Matches ─────────────────────────
// District matches: level=DISTRICT, club in player's district
// State matches:    level=STATE, approved
// National matches: level=NATIONAL, approved
export const getPlayerPublicMatches = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;

  if (role !== "PLAYER" && role !== "STUDENT") {
    return res.status(403).json({ error: "Only players can access this endpoint" });
  }

  try {
    const player = await prisma.student.findUnique({
      where: { id: userId },
      select: {
        districtId: true,
        isPaid: true,
        isBPL: true,
        gender: true,
        district: { select: { zoneName: true } }
      },
    });

    if (!player) return res.status(404).json({ error: "Player not found" });

    // District-level: only from clubs in same district, matching player's gender
    const districtTournaments = await prisma.tournament.findMany({
      where: {
        status: { in: ["APPROVED", "CLOSED"] },
        level: "DISTRICT",
        club: { districtId: player.districtId },
        OR: [
          { gender: "BOTH" },
          { gender: player.gender }
        ]
      },
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { playerId: userId }, select: { id: true, status: true, isPaid: true, placement: true, ageGroup: true, weightCategory: true, gender: true } },
        club: { select: { name: true, district: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    });

    // Zonal-level: level=ZONE, match tournament's zoneId with player's zone, matching player's gender
    const zonalTournaments = await prisma.tournament.findMany({
      where: {
        status: { in: ["APPROVED", "CLOSED"] },
        level: "ZONE",
        zoneId: player.district?.zoneName ?? "",
        OR: [
          { gender: "BOTH" },
          { gender: player.gender }
        ]
      },
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { playerId: userId }, select: { id: true, status: true, isPaid: true, placement: true, ageGroup: true, weightCategory: true, gender: true } },
        club: { select: { name: true, district: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    });

    // State & National: open to all players, but must match gender
    const stateNationalTournaments = await prisma.tournament.findMany({
      where: {
        status: { in: ["APPROVED", "CLOSED"] },
        level: { in: ["STATE", "NATIONAL"] },
        OR: [
          { gender: "BOTH" },
          { gender: player.gender }
        ]
      },
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { playerId: userId }, select: { id: true, status: true, isPaid: true, placement: true, ageGroup: true, weightCategory: true, gender: true } },
        club: { select: { name: true, district: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    });

    const tournamentIds = [
      ...districtTournaments.map((t: any) => t.id),
      ...zonalTournaments.map((t: any) => t.id),
      ...stateNationalTournaments.map((t: any) => t.id)
    ];

    const concludedDraws = await prisma.tournamentDraw.findMany({
      where: {
        tournamentId: { in: tournamentIds },
        isConcluded: true
      },
      select: {
        tournamentId: true,
        ageGroup: true,
        gender: true,
        weightCategory: true
      }
    });

    const concludedDrawsSet = new Set(
      concludedDraws.map((d: any) => `${d.tournamentId}_${d.ageGroup}_${d.gender}_${d.weightCategory}`)
    );

    const mapTournament = (t: any) => {
      const myReg = t.registrations[0] || null;
      let isCategoryConcluded = false;
      if (myReg) {
        const drawKey = `${t.id}_${myReg.ageGroup}_${myReg.gender}_${myReg.weightCategory}`;
        isCategoryConcluded = concludedDrawsSet.has(drawKey);
      }

      return {
        ...t,
        registrationCount: t._count.registrations,
        myRegistration: myReg ? {
          ...myReg,
          isCategoryConcluded
        } : null,
        myRegistrations: t.registrations || [],
      registrations: undefined,
        _count: undefined,
      };
    };

    return res.json({
      district: districtTournaments.map(mapTournament),
      zonal: zonalTournaments.map(mapTournament),
      stateAndNational: stateNationalTournaments.map(mapTournament),
    });
  } catch (error) {
    console.error("Error fetching player public matches:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── PLAYER: Create Tournament Payment Order ────────────────────────────────
export const createTournamentPaymentOrder = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const { tournamentId, height, weight, coachId, category } = req.body;

  if (role !== "PLAYER" && role !== "STUDENT") {
    return res.status(403).json({ error: "Only players can register for tournaments" });
  }

  if (!tournamentId) {
    return res.status(400).json({ error: "tournamentId is required" });
  }

  try {
    const player = await prisma.student.findUnique({
      where: { id: userId },
      select: { clubId: true, districtId: true, isPaid: true, isBPL: true, age: true, gender: true },
    });

    if (!player) return res.status(404).json({ error: "Player not found" });
    if (!player.isPaid && !player.isBPL) {
      return res.status(403).json({ error: "Complete your membership payment before joining a tournament" });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { club: { select: { districtId: true } } },
    });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    // ── Access restriction based on tournament level ──────────────────────
    if (tournament.level === "DISTRICT") {
      // District match: player must be from the same district as the organising club
      const tournamentDistrictId = tournament.club?.districtId;
      if (!tournamentDistrictId || tournamentDistrictId !== player.districtId) {
        return res.status(403).json({ error: "This district match is only open to players from the same district" });
      }
    } else if ((tournament.level as any) === "CLUB") {
      // Club tournament: player must belong to the same club
      if (tournament.clubId !== player.clubId) {
        return res.status(403).json({ error: "This tournament is only for members of the organising club" });
      }
    }
    // STATE and NATIONAL: no restriction — any player can register

    // ── Age and Gender validation ───────────────────────────────────────────
    if (tournament.ageFrom && player.age < tournament.ageFrom) {
      return res.status(403).json({ error: `You must be at least ${tournament.ageFrom} years old to join this tournament.` });
    }
    if (tournament.ageTo && player.age > tournament.ageTo) {
      return res.status(403).json({ error: `You must be at most ${tournament.ageTo} years old to join this tournament.` });
    }
    if (tournament.gender && tournament.gender !== "BOTH" && tournament.gender !== player.gender) {
      return res.status(403).json({ error: `This tournament is restricted to ${tournament.gender} players only.` });
    }

    // ─── Calculate ageGroup and weightCategory ──
    const playerData = await prisma.student.findUnique({
      where: { id: userId },
      select: { dob: true, gender: true, age: true },
    });

    if (!playerData) {
      return res.status(404).json({ error: "Player data not found" });
    }

    const playerGender = playerData.gender === "FEMALE" ? "FEMALE" : "MALE";
    const ageGroup = getAgeGroup(playerData.dob, category);
    const weightCategory = weight ? getWeightCategory(Number(weight), playerGender, ageGroup) : "ALL";

    // Check duplicate
    const existing = await prisma.tournamentRegistration.findUnique({
      where: { 
        tournamentId_playerId_ageGroup_weightCategory: { 
          tournamentId, 
          playerId: userId,
          ageGroup,
          weightCategory
        } 
      },
    });
    if (existing) return res.status(400).json({ error: "You have already registered for this category in this tournament" });

    // Handle Free/BPL Registration
    const isFree = tournament.entryFee === 0 || (tournament.allowBPL && player.isBPL);
    if (isFree) {
      const registration = await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          playerId: userId,
          status: "APPROVED",
          isPaid: true, // It's free, so consider it paid
          height: height || null,
          weight: weight || null,
          coachId: coachId || null,
          ageGroup,
          weightCategory,
          gender: playerGender,
        },
      });

      // ─── Auto-create or get tournament draw based on player's category ──
      if (playerData && weight) {
        // Get tournament's gender (could be MALE, FEMALE, or BOTH)
        const tournamentGender = tournament.gender === "BOTH" ? playerGender : tournament.gender;

        await createOrGetDraw(tournamentId, tournamentGender, ageGroup, weightCategory, player.age);
      }


      const freOrganiserId = tournament.clubId || tournament.officialId;
      if (freOrganiserId) {
        sendNotificationToUser(freOrganiserId, {
          type: "NEW_TOURNAMENT_REGISTRATION",
          message: `A player has successfully registered for your tournament "${tournament.title}".`,
          tournamentId,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json({ isFree: true, message: "Registered successfully for free tournament.", registration });
    }

    const receipt = `trn_${tournamentId.substring(0, 10)}_${userId.substring(0, 10)}`;
    const order = await razorpay.orders.create({
      amount: Math.round(tournament.entryFee * 100),
      currency: "INR",
      receipt,
    });

    return res.json(order);
  } catch (error) {
    console.error("Error creating tournament payment order:", error);
    return res.status(500).json({ error: "Failed to create payment order" });
  }
};

// ─── PLAYER: Verify Payment & Register ───────────────────────────────────────
export const verifyTournamentPayment = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const { tournamentId, razorpay_payment_id, razorpay_order_id, razorpay_signature, height, weight, coachId, category } = req.body;

  if (role !== "PLAYER" && role !== "STUDENT") {
    return res.status(403).json({ error: "Only players can register for tournaments" });
  }

  if (!tournamentId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing required payment fields" });
  }

  try {
    // Verify Razorpay signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "");
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    // ─── Calculate ageGroup and weightCategory ──
    const playerData = await prisma.student.findUnique({
      where: { id: userId },
      select: { dob: true, gender: true, age: true },
    });

    if (!playerData) return res.status(404).json({ error: "Player not found" });

    const playerGender = playerData.gender === "FEMALE" ? "FEMALE" : "MALE";
    const ageGroup = getAgeGroup(playerData.dob, category);
    const weightCategory = weight ? getWeightCategory(Number(weight), playerGender, ageGroup) : "ALL";

    const existing = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId: userId,
        ageGroup,
        weightCategory,
      },
    });
    if (existing) return res.status(400).json({ error: "Already registered for this category in this tournament" });

    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId: userId,
        status: "APPROVED",
        isPaid: true,
        paymentId: razorpay_payment_id,
        height: height || null,
        weight: weight || null,
        coachId: coachId || null,
        ageGroup,
        weightCategory,
        gender: playerGender,
      },
    });

    // ─── Auto-create or get tournament draw based on player's category ──
    if (playerData && weight) {
      // Get tournament's gender (could be MALE, FEMALE, or BOTH)
      const tournamentGender = tournament.gender === "BOTH" ? playerGender : tournament.gender;

      await createOrGetDraw(tournamentId, tournamentGender, ageGroup, weightCategory, playerData.age);
    }

    // Update the student's global profile with latest height/weight
    if (height || weight) {
      await prisma.student.update({
        where: { id: userId },
        data: {
          ...(height && { height: height }),
          ...(weight && { weight: weight })
        }
      });
    }

    // Notify the organiser (club or official) that a new player registered
    const organiserId = tournament.clubId || tournament.officialId;
    if (organiserId) {
      sendNotificationToUser(organiserId, {
        type: "NEW_TOURNAMENT_REGISTRATION",
        message: `A player has paid and successfully registered for your tournament "${tournament.title}".`,
        tournamentId,
        createdAt: new Date().toISOString(),
      });
    }

    return res.status(201).json({
      message: "Payment verified. Registration successful.",
      registration,
    });
  } catch (error) {
    console.error("Error verifying tournament payment:", error);
    return res.status(500).json({ error: "Payment verification failed" });
  }
};

// ─── ADMIN: Get Tournaments Pending Approval ────────────────────────────────
export const getAdminTournaments = async (req: Request, res: Response) => {
  const { role } = (req as any).user;

  try {
    let whereClause: any = {};

    if (role === "DISTRICT_PRESIDENT" || role === "DISTRICT_SECRETARY") {
      whereClause = { status: "PENDING", districtApproval: "PENDING", level: "NATIONAL" };
    } else if (role === "STATE_PRESIDENT" || role === "STATE_SECRETARY") {
      whereClause = { 
        status: "PENDING",
        stateApproval: "PENDING",
        level: { in: ["NATIONAL", "STATE", "ZONE", "DISTRICT"] }
      };
    } else if (role === "SUPER_ADMIN") {
      // Super Admin sees all pending — both their own queue and CEO's queue combined
      whereClause = {
        status: "PENDING",
        OR: [
          { superAdminApproval: "PENDING" },
          { ceoApproval: "PENDING" },
        ],
      };
    } else if (role === "CEO") {
      // CEO sees all pending — same as Super Admin (no level restriction)
      whereClause = {
        status: "PENDING",
        OR: [
          { ceoApproval: "PENDING" },
          { superAdminApproval: "PENDING" },
        ],
      };
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const tournaments = await prisma.tournament.findMany({
      where: whereClause,
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
        club: { select: { name: true, district: { select: { name: true } } } }
      },
      orderBy: { createdAt: "desc" },
    });

    const result = tournaments.map((t: any) => ({
      ...t,
      registrationCount: t._count.registrations,
      hasPendingPlayers: t.registrations.length > 0,
      registrations: undefined,
      _count: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching admin tournaments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ADMIN: Get Tournaments Approved By This Role ────────────────────────────
export const getAdminApprovedTournaments = async (req: Request, res: Response) => {
  const { role } = (req as any).user;

  try {
    let whereClause: any = {};

    if (role === "DISTRICT_PRESIDENT" || role === "DISTRICT_SECRETARY") {
      whereClause = { districtApproval: "APPROVED" };
    } else if (role === "STATE_PRESIDENT" || role === "STATE_SECRETARY") {
      whereClause = { stateApproval: "APPROVED" };
    } else if (role === "SUPER_ADMIN") {
      whereClause = { superAdminApproval: "APPROVED" };
    } else if (role === "CEO") {
      whereClause = { ceoApproval: "APPROVED" };
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const tournaments = await prisma.tournament.findMany({
      where: whereClause,
      include: {
        _count: { select: { registrations: true } },
        registrations: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
        club: { select: { name: true, district: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = tournaments.map((t: any) => ({
      ...t,
      registrationCount: t._count.registrations,
      hasPendingPlayers: t.registrations.length > 0,
      registrations: undefined,
      _count: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching admin approved tournaments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ADMIN: Approve or Reject Tournament ────────────────────────────────────
export const approveTournament = async (req: Request, res: Response) => {
  const { role } = (req as any).user;
  const id = req.params.id as string;
  const { status, remark, message } = req.body;

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });
  }

  if (status === "REJECTED" && !remark && !message) {
    return res.status(400).json({ error: "Rejection remark is required" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const rejectionText = remark || message || "";
    let dataToUpdate: any = {};

    if (status === "REJECTED") {
      dataToUpdate = { status: "REJECTED", rejectionRemark: rejectionText };
      if (role.startsWith("DISTRICT")) dataToUpdate.districtApproval = "REJECTED";
      if (role.startsWith("STATE")) dataToUpdate.stateApproval = "REJECTED";
      if (role === "SUPER_ADMIN") dataToUpdate.superAdminApproval = "REJECTED";
      if (role === "CEO") dataToUpdate.ceoApproval = "REJECTED";
    } else {
      if (role.startsWith("DISTRICT")) dataToUpdate.districtApproval = "APPROVED";
      if (role.startsWith("STATE")) dataToUpdate.stateApproval = "APPROVED";
      if (role === "SUPER_ADMIN") dataToUpdate.superAdminApproval = "APPROVED";
      if (role === "CEO") dataToUpdate.ceoApproval = "APPROVED";

      const distApp = dataToUpdate.districtApproval || tournament.districtApproval;
      const stateApp = dataToUpdate.stateApproval || tournament.stateApproval;
      const saApp = dataToUpdate.superAdminApproval || tournament.superAdminApproval;
      const ceoApp = dataToUpdate.ceoApproval || tournament.ceoApproval;

      // Super Admin and CEO can bypass lower-level approvals
      if (role === "SUPER_ADMIN" || role === "CEO") {
        dataToUpdate.status = "APPROVED";
        dataToUpdate.districtApproval = "APPROVED";
        dataToUpdate.stateApproval = "APPROVED";
        dataToUpdate.superAdminApproval = "APPROVED";
        dataToUpdate.ceoApproval = "APPROVED";
      } else {
        const allDone = ["APPROVED", "NOT_REQUIRED"].includes(distApp) &&
                        ["APPROVED", "NOT_REQUIRED"].includes(stateApp) &&
                        ["APPROVED", "NOT_REQUIRED"].includes(saApp) &&
                        ["APPROVED", "NOT_REQUIRED"].includes(ceoApp);
        if (allDone) {
          dataToUpdate.status = "APPROVED";
        }
      }
    }

    const updated = await prisma.tournament.update({ where: { id }, data: dataToUpdate });

    const notifyId = tournament.clubId || tournament.officialId;
    if (dataToUpdate.status === "APPROVED") {
      if (notifyId) {
        const customMsg = message?.trim();
        sendNotificationToUser(notifyId, {
          type: "TOURNAMENT_APPROVED",
          message: customMsg || `Your tournament "${tournament.title}" has been approved and is now live!`,
          tournamentId: id,
          createdAt: new Date().toISOString(),
        });
      }

      // Background task to send announcement emails to eligible players
      (async () => {
        try {
          const playerWhereClause: any = { status: "APPROVED" };

          if (tournament.level === "DISTRICT" && tournament.clubId) {
            const club = await prisma.club.findUnique({ where: { id: tournament.clubId }, select: { districtId: true } });
            if (club?.districtId) {
              playerWhereClause.districtId = club.districtId;
            }
          } else if (tournament.level === "ZONE" && tournament.zoneId) {
            playerWhereClause.district = { zoneName: tournament.zoneId };
          } else if ((tournament.level as string) === "CLUB" && tournament.clubId) {
            playerWhereClause.clubId = tournament.clubId;
          }

          if (tournament.gender !== "BOTH") {
            playerWhereClause.gender = tournament.gender;
          }

          const eligiblePlayers = await prisma.student.findMany({
            where: playerWhereClause,
            select: { email: true, fullName: true },
          });

          for (const player of eligiblePlayers) {
            if (player.email) {
              await sendNewTournamentAnnouncement({
                toEmail: player.email,
                toName: player.fullName,
                tournamentTitle: tournament.title,
                tournamentDate: new Date(tournament.date).toLocaleDateString("en-IN"),
                tournamentLevel: tournament.level
              }).catch((err: any) => console.error("Failed to send announcement to", player.email, err));
            }
          }
        } catch (err) {
          console.error("Error sending bulk announcement emails:", err);
        }
      })();

    } else if (status === "REJECTED" && notifyId) {
      const customMsg = message?.trim();
      sendNotificationToUser(notifyId, {
        type: "TOURNAMENT_REJECTED",
        message: customMsg || `Your tournament "${tournament.title}" was rejected. Reason: ${rejectionText}`,
        tournamentId: id,
        createdAt: new Date().toISOString(),
      });
    }

    return res.json({ message: `Tournament ${status.toLowerCase()} successfully`, tournament: updated });
  } catch (error) {
    console.error("Error approving tournament:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ADMIN: Send Reply to Tournament Creator ─────────────────────────────────
export const sendTournamentReply = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;
  const { message } = req.body;

  const allowed = ["SUPER_ADMIN", "CEO", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY",
    "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "CLUB"];
  if (!allowed.includes(role)) return res.status(403).json({ error: "Access denied" });
  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    // Verify user is either a reviewing official or the tournament creator
    const isCreator = (role === "CLUB" && tournament.clubId === userId) || (tournament.officialId === userId);
    const isReviewer = ["SUPER_ADMIN", "CEO", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY"].includes(role);

    if (!isCreator && !isReviewer) {
      return res.status(403).json({ error: "You are not authorized to send messages for this tournament" });
    }

    let senderName = "Official";
    if (role === "SUPER_ADMIN") {
      senderName = "Super Admin";
    } else if (role === "CLUB") {
      const club = await prisma.club.findUnique({
        where: { id: userId },
        select: { name: true }
      });
      if (club) senderName = club.name;
    } else {
      const member = await prisma.member.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });
      if (member) senderName = member.fullName;
    }

    // Save message to database
    const replyMessage = await prisma.tournamentMessage.create({
      data: {
        tournamentId: id,
        senderRole: role,
        senderName: senderName,
        message: message.trim(),
      }
    });

    // Notify appropriate parties via WebSocket
    if (isReviewer) {
      // If a reviewer commented, notify the creator
      const creatorId = tournament.clubId || tournament.officialId;
      if (creatorId) {
        sendNotificationToUser(creatorId, {
          type: "TOURNAMENT_APPROVED",
          message: `${senderName} commented on your tournament: "${message.trim()}"`,
          tournamentId: id,
          createdAt: replyMessage.createdAt.toISOString(),
        });
      }
    } else if (isCreator) {
      // If the creator commented, we can notify admins (e.g. using sendNotificationToAdmins if imported)
      try {
        const { sendNotificationToAdmins } = await import("../../socket/socket.js");
        sendNotificationToAdmins({
          type: "NEW_TOURNAMENT",
          tournamentId: id,
          message: `Tournament creator (${senderName}) left a comment on "${tournament.title}": "${message.trim()}"`,
        });
      } catch (wsErr) {
        console.error("WS notify admins error:", wsErr);
      }
    }

    return res.json({ message: "Reply sent successfully", reply: replyMessage });
  } catch (error) {
    console.error("Error sending tournament reply:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ANY AUTHORIZED: Get Tournament Messages ──────────────────────────────────
export const getTournamentMessages = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const messages = await prisma.tournamentMessage.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "asc" }
    });
    return res.json(messages);
  } catch (error) {
    console.error("Error fetching tournament messages:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ANY AUTHORIZED: Get Tournament By Id ────────────────────────────────────
export const getTournamentById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        club: { select: { name: true, district: { select: { name: true } } } }
      }
    });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    return res.json(tournament);
  } catch (error) {
    console.error("Error fetching tournament by ID:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ANY AUTHORIZED: Get Tournament Draws ────────────────────────────────────
export const getTournamentDraws = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const draws = await prisma.tournamentDraw.findMany({
      where: { tournamentId: id }
    });
    return res.json(draws);
  } catch (error) {
    console.error("Error fetching draws:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── HELPER: Auto-advance winner to next round ──────────────────────────────
const autoAdvanceWinner = (rounds: any[]): any[] => {
  // Process each round from first to second-to-last
  for (let roundIdx = 0; roundIdx < rounds.length - 1; roundIdx++) {
    const currentRound = rounds[roundIdx];
    const nextRound = rounds[roundIdx + 1];

    // Check each match in current round
    for (let matchIdx = 0; matchIdx < currentRound.length; matchIdx++) {
      const match = currentRound[matchIdx];

      // If match is completed and has a winner
      if (match.status === "COMPLETED" && match.winnerId) {
        // Find which slot in next round this winner should occupy
        const nextMatchIdx = Math.floor(matchIdx / 2);
        const isFirstSlot = matchIdx % 2 === 0; // Slots A and B alternate

          if (nextMatchIdx < nextRound.length) {
            const nextMatch = nextRound[nextMatchIdx];
            const isWinnerA = match.winnerId === match.slotA.playerId;
            const winnerSlot = {
              playerId: match.winnerId,
              regId: isWinnerA ? (match.slotA as any).regId : (match.slotB as any).regId,
              playerName: isWinnerA ? match.slotA.playerName : match.slotB.playerName,
              club: isWinnerA ? match.slotA.club : match.slotB.club,
              isBye: false,
              seedNumber: isWinnerA ? match.slotA.seedNumber : match.slotB.seedNumber,
            };

            // Update the appropriate slot (A or B) if it's TBD
            if (isFirstSlot && nextMatch.slotA.playerName === "TBD") {
              nextRound[nextMatchIdx].slotA = winnerSlot;
            } else if (!isFirstSlot && nextMatch.slotB.playerName === "TBD") {
              nextRound[nextMatchIdx].slotB = winnerSlot;
            }
            
            // Bronze Match Logic: If this is the semi-final and a bronze match exists
            if (roundIdx === rounds.length - 2 && nextRound.length > 1) {
              const loserSlot = {
                playerId: isWinnerA ? match.slotB.playerId : match.slotA.playerId,
                regId: isWinnerA ? (match.slotB as any).regId : (match.slotA as any).regId,
                playerName: isWinnerA ? match.slotB.playerName : match.slotA.playerName,
                club: isWinnerA ? match.slotB.club : match.slotA.club,
                isBye: false,
                seedNumber: isWinnerA ? match.slotB.seedNumber : match.slotA.seedNumber,
              };

              const bronzeMatch = nextRound[1];
              if (isFirstSlot && bronzeMatch.slotA.playerName === "TBD") {
                nextRound[1].slotA = loserSlot;
              } else if (!isFirstSlot && bronzeMatch.slotB.playerName === "TBD") {
                nextRound[1].slotB = loserSlot;
              }
            }
          }
      }
    }
  }

  return rounds;
};

// ─── ADMIN/CLUB: Save Tournament Draw ────────────────────────────────────────
// A user may modify a match/draw if they own the tournament (club/official),
// are a global admin, or are the referee assigned to that draw's specific mat —
// a coach assigned to Mat 1 must not be able to edit matches on Mat 2.
async function canModifyTournamentMatch(
  userId: string,
  role: string,
  tournament: { clubId: string | null; officialId: string | null },
  matNumber: number,
  tournamentId: string
): Promise<boolean> {
  if (role === "SUPER_ADMIN" || role === "CEO") return true;
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY"].includes(role);
  if ((isOfficial || role === "CLUB") && (tournament.clubId === userId || tournament.officialId === userId)) return true;
  if (role === "COACH") {
    const isAssigned = await prisma.tournamentMat.findFirst({
      where: { tournamentId, refereeId: userId, matNumber }
    });
    return !!isAssigned;
  }
  return false;
}

export const saveTournamentDraw = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;
  const { ageGroup, exactAge, gender, weightCategory, matNumber, rounds } = req.body;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);
  const isCoach = role === "COACH";

  if (!isClub && !isOfficial && !isCoach) {
    return res.status(403).json({ error: "Only authorized personnel can save draws" });
  }

  if (!ageGroup || exactAge === undefined || !gender || !weightCategory || !rounds) {
    return res.status(400).json({ error: "Missing required draw parameters" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const allowed = await canModifyTournamentMatch(userId, role, tournament, matNumber ? Number(matNumber) : 1, id);
    if (!allowed) {
      return res.status(403).json({
        error: isCoach ? "You are not assigned as a referee to this mat" : "This tournament does not belong to you"
      });
    }

    // Auto-advance winners to next round
    const updatedRounds = autoAdvanceWinner(JSON.parse(JSON.stringify(rounds)));

    const draw = await prisma.tournamentDraw.upsert({
      where: {
        tournamentId_ageGroup_exactAge_gender_weightCategory: {
          tournamentId: id,
          ageGroup,
          exactAge: Number(exactAge),
          gender,
          weightCategory,
        }
      },
      update: {
        matNumber: matNumber ? Number(matNumber) : 1,
        rounds: updatedRounds
      },
      create: {
        tournamentId: id,
        ageGroup,
        exactAge: Number(exactAge),
        gender,
        weightCategory,
        matNumber: matNumber ? Number(matNumber) : 1,
        rounds: updatedRounds
      }
    });
    return res.json({ message: "Draw saved successfully", draw });
  } catch (error) {
    console.error("Error saving draw:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── ADMIN/CLUB/OFFICIAL: Submit Final Results ───────────────────────────────
export const submitTournamentResults = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const id = req.params.id as string;
  const { results, ageGroup, exactAge, gender, weightCategory } = req.body;

  const isClub = role === "CLUB";
  const isOfficial = ["DISTRICT_PRESIDENT", "DISTRICT_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "STATE_PRESIDENT", "STATE_SECRETARY", "CEO", "SUPER_ADMIN"].includes(role);

  if (!isClub && !isOfficial) {
    return res.status(403).json({ error: "Only clubs and officials can submit results" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    if (role !== "SUPER_ADMIN" && role !== "CEO" && tournament.clubId !== userId && tournament.officialId !== userId) return res.status(403).json({ error: "This tournament does not belong to you" });

    // Ensure all registrations/players are in this tournament
    const regIds = results.map((r: any) => r.regId).filter(Boolean);
    const playerIds = results.map((r: any) => r.playerId).filter(Boolean);

    let validRegistrations;
    if (regIds.length > 0) {
      validRegistrations = await prisma.tournamentRegistration.findMany({
        where: { id: { in: regIds }, tournamentId: id },
      });
      if (validRegistrations.length !== regIds.length) {
        return res.status(400).json({ error: "One or more registrations are invalid for this tournament" });
      }
    } else {
      validRegistrations = await prisma.tournamentRegistration.findMany({
        where: { tournamentId: id, playerId: { in: playerIds } },
      });
      if (validRegistrations.length !== playerIds.length) {
        return res.status(400).json({ error: "One or more players are not registered in this tournament" });
      }
    }

    // Use a transaction to update placements
    await prisma.$transaction(
      results.map((r: any) => {
        if (r.regId) {
          return prisma.tournamentRegistration.update({
            where: { id: r.regId },
            data: { placement: r.placement },
          });
        } else {
          return prisma.tournamentRegistration.updateMany({
            where: { tournamentId: id, playerId: r.playerId },
            data: { placement: r.placement },
          });
        }
      })
    );

    let isTournamentClosed = false;

    if (ageGroup && gender && weightCategory) {
      // Conclude the specific category draw
      await prisma.tournamentDraw.update({
        where: {
          tournamentId_ageGroup_exactAge_gender_weightCategory: {
            tournamentId: id,
            ageGroup,
            exactAge: exactAge !== undefined ? Number(exactAge) : 0,
            gender,
            weightCategory,
          }
        },
        data: { isConcluded: true }
      });

      // Check if all draws are concluded
      const allDraws = await prisma.tournamentDraw.findMany({
        where: { tournamentId: id }
      });
      const allConcluded = allDraws.every((d: any) => d.isConcluded);
      if (allConcluded && allDraws.length > 0) {
        await prisma.tournament.update({
          where: { id },
          data: { status: "CLOSED" },
        });
        isTournamentClosed = true;
      }
    } else {
      // Legacy behavior: conclude the entire tournament
      await prisma.tournamentDraw.updateMany({
        where: { tournamentId: id },
        data: { isConcluded: true }
      });
      await prisma.tournament.update({
        where: { id },
        data: { status: "CLOSED" },
      });
      isTournamentClosed = true;
    }

    return res.json({ 
      message: isTournamentClosed ? "Results submitted successfully. Tournament is now closed." : "Category results submitted successfully.",
      isTournamentClosed
    });
  } catch (error) {
    console.error("Error submitting results:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getTournamentMats = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const mats = await prisma.tournamentMat.findMany({
      where: { tournamentId: id as string },
      include: { referee: { select: { fullName: true, permanentId: true, tempId: true } } },
      orderBy: { matNumber: 'asc' }
    });
    return res.json({ mats });
  } catch (error) {
    console.error("Error fetching tournament mats:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const saveTournamentMats = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { assignments } = req.body; // Array of { matNumber: number, refereeId: string }
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: id as string } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    // Resolve referee IDs if they are provided (allows TempID, PermanentID, or UUID)
    const resolvedAssignments = await Promise.all(assignments.map(async (a: any) => {
      let finalRefereeId = null;
      if (a.refereeId) {
        const referee = await prisma.coachReferee.findFirst({
          where: { OR: [ { id: a.refereeId }, { tempId: a.refereeId }, { permanentId: a.refereeId } ] },
          select: { id: true }
        });
        if (referee) finalRefereeId = referee.id;
      }
      return {
        tournamentId: id,
        matNumber: a.matNumber,
        refereeId: finalRefereeId
      };
    }));

    await prisma.$transaction([
      prisma.tournamentMat.deleteMany({ where: { tournamentId: id as string } }),
      prisma.tournamentMat.createMany({
        data: resolvedAssignments
      })
    ]);
    return res.json({ message: "Mat assignments saved successfully." });
  } catch (error) {
    console.error("Error saving tournament mats:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getRefereeMats = async (req: Request | any, res: Response) => {
  try {
    const refereeId = req.user?.userId;
    if (!refereeId) return res.status(401).json({ error: "Unauthorized" });

    const mats = await prisma.tournamentMat.findMany({
      where: { refereeId },
      include: {
        tournament: {
          select: { id: true, title: true, date: true, status: true, location: true }
        }
      },
      orderBy: { tournament: { date: 'desc' } }
    });

    return res.json({ mats });
  } catch (error) {
    console.error("Error fetching referee mats:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const submitMatchResult = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const { id, matchId } = req.params;
  const { winnerId } = req.body;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: id as string } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const draws = await prisma.tournamentDraw.findMany({ where: { tournamentId: id as string } });

    let targetDraw: (typeof draws)[number] | null = null;
    let targetMatch: any = null;
    for (const draw of draws) {
      const rounds: any[][] = draw.rounds as any[][];
      for (const round of rounds) {
        const match = round.find((m: any) => m.matchId === matchId);
        if (match) { targetDraw = draw; targetMatch = match; break; }
      }
      if (targetMatch) break;
    }

    if (!targetDraw || !targetMatch) return res.status(404).json({ error: "Match not found" });

    const allowed = await canModifyTournamentMatch(userId, role, tournament, targetDraw.matNumber, id as string);
    if (!allowed) return res.status(403).json({ error: "You are not authorized to update this match" });

    targetMatch.winnerId = winnerId;
    targetMatch.status = "COMPLETED";

    await prisma.tournamentDraw.update({
      where: { id: targetDraw.id },
      data: { rounds: targetDraw.rounds as any }
    });

    return res.json({ message: "Match result saved successfully" });
  } catch (error) {
    console.error("Error saving match result:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateMatchState = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const { id, matchId } = req.params;
  const { scoreA, scoreB, logs, timeLeft, status } = req.body;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: id as string } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const draws = await prisma.tournamentDraw.findMany({ where: { tournamentId: id as string } });

    let targetDraw: (typeof draws)[number] | null = null;
    let targetMatch: any = null;
    for (const draw of draws) {
      const rounds: any[][] = draw.rounds as any[][];
      for (const round of rounds) {
        const match = round.find((m: any) => m.matchId === matchId);
        if (match) { targetDraw = draw; targetMatch = match; break; }
      }
      if (targetMatch) break;
    }

    if (!targetDraw || !targetMatch) return res.status(404).json({ error: "Match not found" });

    const allowed = await canModifyTournamentMatch(userId, role, tournament, targetDraw.matNumber, id as string);
    if (!allowed) return res.status(403).json({ error: "You are not authorized to update this match" });

    if (scoreA !== undefined) targetMatch.scoreA = scoreA;
    if (scoreB !== undefined) targetMatch.scoreB = scoreB;
    if (logs !== undefined) targetMatch.logs = logs;
    if (timeLeft !== undefined) targetMatch.timeLeft = timeLeft;
    if (status !== undefined) targetMatch.status = status;

    await prisma.tournamentDraw.update({
      where: { id: targetDraw.id },
      data: { rounds: targetDraw.rounds as any }
    });

    return res.json({ message: "Match state updated successfully" });
  } catch (error) {
    console.error("Error updating match state:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Matches an Excel column value regardless of exact header wording — case,
// spacing, punctuation, and unit suffixes like "(kg)"/"(cm)" are ignored, so
// "Player Name" / "Full Name" / "full_name" all resolve to the same field.
function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
}

function pickField(row: Record<string, any>, aliases: string[]): any {
  const normalizedRow: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    normalizedRow[normalizeHeader(key)] = row[key];
  }
  for (const alias of aliases) {
    const value = normalizedRow[normalizeHeader(alias)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

// Finds an existing Student by Aadhaar number, or creates one with the same
// defaults the bulk-import flow has always used (auto-approved, tempId
// auto-generated, password hashed from mobile number). Shared by the Excel
// bulk-import path (which resolves district/taluk/club/coach by name before
// calling this) and the single-player "Create New Player" admin flow (which
// already has resolved IDs from dropdowns).
async function findOrCreateStudentByAadhaar(input: {
  aadhaarNumber: string;
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  dob?: Date;
  gender?: string;
  districtId?: string;
  talukId?: string;
  schoolName?: string;
  bloodGroup?: string;
  annualIncome?: number;
  grade?: string;
  weight?: string | null;
  height?: string | null;
  belt?: string | null;
  clubId?: string | null;
  coachId?: string | null;
}): Promise<{ student: Awaited<ReturnType<typeof prisma.student.create>> } | { error: string }> {
  const existing = await prisma.student.findUnique({ where: { aadhaarNumber: input.aadhaarNumber } });
  if (existing) return { student: existing };

  if (!input.fullName || !input.dob || !input.gender || !input.districtId || !input.talukId) {
    return { error: "Player not found and missing required fields to create new player (Full Name, DOB, Gender, District, Taluk)" };
  }
  if (isNaN(input.dob.getTime())) {
    return { error: "Invalid Date of Birth format" };
  }

  const age = new Date().getFullYear() - input.dob.getFullYear();
  const mobileNumber = input.mobileNumber || "0000000000";
  const email = input.email || `dummy_${input.aadhaarNumber}@example.com`;
  const hashedPassword = await bcrypt.hash(String(mobileNumber), 10);

  try {
    const student = await prisma.student.create({
      data: {
        tempId: `TMP${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        districtId: input.districtId,
        talukId: input.talukId,
        fullName: input.fullName,
        dob: input.dob,
        age,
        gender: input.gender.toUpperCase() === "FEMALE" ? "FEMALE" : "MALE",
        mobileNumber: String(mobileNumber),
        email: String(email),
        aadhaarNumber: input.aadhaarNumber,
        password: hashedPassword,
        status: "APPROVED", // Auto-approved from admin-side creation
        pincode: "000000",
        bloodGroup: input.bloodGroup || "UNKNOWN",
        address: "Unknown",
        city: "Unknown",
        state: "Tamil Nadu",
        addressPincode: "000000",
        nationality: "Indian",
        annualIncome: input.annualIncome ?? 0,
        schoolName: input.schoolName || "Unknown",
        grade: input.grade || "Unknown",
        weight: input.weight || null,
        height: input.height || null,
        belt: input.belt || null,
        clubId: input.clubId || null,
        coachId: input.coachId || null,
      },
    });
    return { student };
  } catch (e) {
    return { error: `Failed to create player: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── CLUB/OFFICIAL: Bulk Import Players from Excel ───────────────────────────
export const bulkImportRegistrations = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  const tournamentId = req.params.id as string;
  const file = req.file;

  const isClub = role === "CLUB";
  const isOfficial = ["SUPER_ADMIN", "CEO", "STATE_PRESIDENT", "STATE_SECRETARY", "ZONE_PRESIDENT", "ZONE_SECRETARY", "DISTRICT_PRESIDENT", "DISTRICT_SECRETARY"].includes(role);

  if (!isClub && !isOfficial) {
    if (file) fs.unlinkSync(file.path);
    return res.status(403).json({ error: "Access denied" });
  }

  if (!file) {
    return res.status(400).json({ error: "No Excel file uploaded" });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (!isOfficial && tournament.clubId !== userId && tournament.officialId !== userId) {
      fs.unlinkSync(file.path);
      return res.status(403).json({ error: "This tournament does not belong to you" });
    }

    // Compare against the end of the tournament's last day, not its start-of-day
    // timestamp — otherwise this blocks imports from the moment the tournament's
    // calendar date begins, even hours before it actually starts.
    const tournamentEnd = new Date(tournament.dateTo || tournament.date);
    tournamentEnd.setHours(23, 59, 59, 999);

    if (tournament.registrationClosed || tournamentEnd < new Date()) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: "Registrations are closed or tournament has already started" });
    }

    // Parse Excel file
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName as string];
    const data = xlsx.utils.sheet_to_json<any>(sheet as any);

    fs.unlinkSync(file.path); // clean up

    // Each row is independent, so rows are processed with bounded concurrency
    // instead of one-at-a-time — a 1000-row sheet processed serially (several
    // awaited DB round trips + a bcrypt hash per row) took minutes and looked
    // frozen to the client; batching cuts that down substantially.
    const processRow = async (row: any, index: number): Promise<{ ok: boolean; row: number; error?: string }> => {
      const rowNum = index + 2; // Assuming header is row 1
      try {
        const aadhaar = pickField(row, ["Aadhaar Number", "Aadhaar", "AadhaarNumber"]);
        const weight = pickField(row, ["Weight", "Weight (kg)"]);
        const height = pickField(row, ["Height", "Height (cm)"]);
        const belt = pickField(row, ["Belt", "Belt Rank", "Belt Colour", "Belt Color"]);
        const coachIdInput = pickField(row, ["Coach ID", "Coach Id", "CoachId", "Coach"]);
        const clubName = pickField(row, ["Club", "Club Name"]);
        const paymentStatusInput = pickField(row, ["Payment Status", "Payment", "Paid", "Payment_Status"]);
        const isPaid = paymentStatusInput
          ? ["paid", "yes", "true", "y", "1"].includes(String(paymentStatusInput).trim().toLowerCase())
          : false;

        if (!aadhaar) {
          return { ok: false, row: rowNum, error: "Aadhaar number missing" };
        }

        // Coach ID is optional — matches a coach's Mobile Number (recommended,
        // since it's known up-front without waiting on a system-generated ID),
        // Temp ID, or Permanent ID; all three are resolved internally. If it
        // doesn't match anything, the registration is still created without a coach.
        // Club is optional — matches by name (case-insensitive). Only applied
        // when creating a brand-new player; falls back to the tournament's own
        // club if the sheet doesn't specify one.
        const [coach, club, existingPlayer] = await Promise.all([
          coachIdInput
            ? prisma.coachReferee.findFirst({
                where: {
                  OR: [
                    { mobileNumber: String(coachIdInput).trim() },
                    { tempId: String(coachIdInput).trim() },
                    { permanentId: String(coachIdInput).trim() },
                  ],
                },
              })
            : Promise.resolve(null),
          clubName
            ? prisma.club.findFirst({ where: { name: { equals: String(clubName).trim(), mode: "insensitive" } } })
            : Promise.resolve(null),
          prisma.student.findUnique({ where: { aadhaarNumber: String(aadhaar) } }),
        ]);
        const resolvedCoachId: string | null = coach?.id || null;
        const resolvedClubId: string | null = club?.id || null;

        let player = existingPlayer;
        if (!player) {
          // Attempt to create new player from Excel data
          const fullName = pickField(row, ["Full Name", "Name", "FullName", "Player Name"]);
          const email = pickField(row, ["Email"]);
          const mobileNumber = pickField(row, ["Mobile Number", "Mobile"]);
          const dobStr = pickField(row, ["Date of Birth", "DOB"]);
          const genderStr = pickField(row, ["Gender", "Sex"]);
          const districtName = pickField(row, ["District Name", "District"]);
          const talukName = pickField(row, ["Taluk Name", "Taluk"]);
          const schoolName = pickField(row, ["School Name", "School"]);

          if (!fullName || !dobStr || !genderStr || !districtName || !talukName) {
            return { ok: false, row: rowNum, error: `Player not found and missing required fields to create new player (Full Name, DOB, Gender, District, Taluk)` };
          }

          // Parse DOB (Excel serial dates aren't real Date objects)
          let dob = new Date(dobStr);
          if (isNaN(dob.getTime())) {
            if (typeof dobStr === "number") {
              dob = new Date((dobStr - (25567 + 2)) * 86400 * 1000);
            } else {
              return { ok: false, row: rowNum, error: `Invalid Date of Birth format` };
            }
          }

          // Find District and Taluk by name (Excel gives names, not IDs)
          const district = await prisma.district.findFirst({ where: { name: { equals: districtName, mode: "insensitive" } } });
          if (!district) {
            return { ok: false, row: rowNum, error: `District not found: ${districtName}` };
          }
          const taluk = await prisma.taluk.findFirst({ where: { name: { equals: talukName, mode: "insensitive" }, districtId: district.id } });
          if (!taluk) {
            return { ok: false, row: rowNum, error: `Taluk not found: ${talukName}` };
          }

          const created = await findOrCreateStudentByAadhaar({
            aadhaarNumber: String(aadhaar),
            fullName: String(fullName),
            email: email ? String(email) : undefined,
            mobileNumber: mobileNumber ? String(mobileNumber) : undefined,
            dob,
            gender: String(genderStr),
            districtId: district.id,
            talukId: taluk.id,
            schoolName: schoolName ? String(schoolName) : undefined,
            bloodGroup: pickField(row, ["Blood Group"]) ? String(pickField(row, ["Blood Group"])) : undefined,
            annualIncome: pickField(row, ["Annual Income"]) ? Number(pickField(row, ["Annual Income"])) : undefined,
            grade: pickField(row, ["Grade"]) ? String(pickField(row, ["Grade"])) : undefined,
            weight: weight ? String(weight) : null,
            height: height ? String(height) : null,
            belt: belt ? String(belt) : null,
            clubId: resolvedClubId || tournament.clubId || null,
            coachId: resolvedCoachId,
          });
          if ("error" in created) {
            return { ok: false, row: rowNum, error: created.error };
          }
          player = created.student;
        }

        if (player.status !== "APPROVED") {
          return { ok: false, row: rowNum, error: `Player with Aadhaar: ${aadhaar} is not APPROVED` };
        }

        // Check if already registered
        const existingReg = await prisma.tournamentRegistration.findFirst({
          where: { tournamentId, playerId: player.id }
        });
        if (existingReg) {
          return { ok: false, row: rowNum, error: `Player already registered for this tournament` };
        }

        const ageGroup = getAgeGroup(player.dob, tournament.category || undefined);
        const weightCategory = weight ? getWeightCategory(Number(weight), player.gender, ageGroup) : "ALL";

        await prisma.tournamentRegistration.create({
          data: {
            tournamentId,
            playerId: player.id,
            coachId: resolvedCoachId || player.coachId, // Coach ID from the sheet takes priority, else whatever the player's own profile has
            status: "APPROVED", // Auto-approve since imported by club/admin
            isPaid,
            weight: weight ? String(weight) : player.weight,
            height: height ? String(height) : player.height,
            belt: belt ? String(belt) : player.belt,
            ageGroup,
            weightCategory,
            gender: player.gender,
          }
        });
        return { ok: true, row: rowNum };
      } catch (e) {
        return { ok: false, row: rowNum, error: e instanceof Error ? e.message : String(e) };
      }
    };

    const CONCURRENCY = 10;
    const results: { ok: boolean; row: number; error?: string }[] = new Array(data.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < data.length) {
        const current = cursor++;
        results[current] = await processRow(data[current], current);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, data.length) }, worker));

    const successCount = results.filter(r => r.ok).length;
    const failedResults = results.filter(r => !r.ok).sort((a, b) => a.row - b.row);
    const errors = failedResults.map(r => ({ row: r.row, error: r.error }));

    return res.json({
      message: `Bulk import completed. ${successCount} successful, ${failedResults.length} failed.`,
      successCount,
      failedCount: failedResults.length,
      errors
    });
  } catch (error) {
    console.error("Error during bulk import:", error);
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) });
  }
};

// ─── Admin: Add a player to a tournament — either an existing approved      ──
// ─── player (`studentId`), or a brand-new one (`newPlayer`, same field set  ──
// ─── as the bulk-import Excel flow, resolved through the same shared helper)─
export const addManualRegistration = async (req: Request, res: Response) => {
  const tournamentId = req.params.id as string;
  const { studentId, newPlayer, weight, height, belt } = req.body;

  if (!studentId && !newPlayer) {
    return res.status(400).json({ error: "Please select a player or provide new player details." });
  }

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    let player;
    if (studentId) {
      player = await prisma.student.findUnique({ where: { id: studentId } });
      if (!player) return res.status(404).json({ error: "Player not found" });
    } else {
      const { fullName, gender, dob, aadhaarNumber, districtId, talukId, mobileNumber, email, schoolName, bloodGroup, annualIncome, grade, clubId, coachId } = newPlayer || {};
      if (!fullName || !gender || !dob || !aadhaarNumber || !districtId || !talukId || !mobileNumber) {
        return res.status(400).json({ error: "Missing required fields for new player (Full Name, Gender, DOB, Aadhaar, Mobile, District, Taluk)." });
      }
      const parsedDob = new Date(dob);
      if (isNaN(parsedDob.getTime())) {
        return res.status(400).json({ error: "Invalid Date of Birth." });
      }
      const created = await findOrCreateStudentByAadhaar({
        aadhaarNumber: String(aadhaarNumber),
        fullName: String(fullName),
        email: email ? String(email) : undefined,
        mobileNumber: String(mobileNumber),
        dob: parsedDob,
        gender: String(gender),
        districtId: String(districtId),
        talukId: String(talukId),
        schoolName: schoolName ? String(schoolName) : undefined,
        bloodGroup: bloodGroup ? String(bloodGroup) : undefined,
        annualIncome: annualIncome !== undefined ? Number(annualIncome) : undefined,
        grade: grade ? String(grade) : undefined,
        weight: weight ? String(weight) : null,
        height: height ? String(height) : null,
        belt: belt ? String(belt) : null,
        clubId: clubId ? String(clubId) : null,
        coachId: coachId ? String(coachId) : null,
      });
      if ("error" in created) {
        return res.status(400).json({ error: created.error });
      }
      player = created.student;
    }
    if (player.status !== "APPROVED") {
      return res.status(400).json({ error: "Only approved players can be added to a tournament" });
    }

    if (tournament.gender && tournament.gender !== "BOTH" && tournament.gender !== player.gender) {
      return res.status(400).json({ error: `This tournament is restricted to ${tournament.gender} players only.` });
    }

    const ageGroup = getAgeGroup(player.dob, tournament.category || undefined);
    const weightCategory = weight ? getWeightCategory(Number(weight), player.gender, ageGroup) : "ALL";

    const existing = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, playerId: player.id, ageGroup, weightCategory },
    });
    if (existing) {
      return res.status(400).json({ error: "This player is already registered for this category in this tournament" });
    }

    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId: player.id,
        coachId: player.coachId,
        status: "APPROVED",
        isPaid: true, // admin-added, bypasses payment
        weight: weight ? String(weight) : player.weight,
        height: height ? String(height) : player.height,
        belt: belt ? String(belt) : player.belt,
        ageGroup,
        weightCategory,
        gender: player.gender,
      },
      include: { player: { select: { fullName: true } } },
    });

    return res.json({ message: "Player added to tournament.", registration });
  } catch (error) {
    console.error("Error adding manual registration:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Export Tournament Completion Report ───────────────────────────────────
export const downloadTournamentReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id: id as string },
      include: {
        club: { select: { name: true, district: { select: { name: true } } } },
        official: { select: { fullName: true } },
        registrations: {
          include: {
            player: {
              select: {
                id: true,
                fullName: true,
                gender: true,
                dob: true,
                club: { select: { name: true } },
                district: { select: { name: true } },
                mobileNumber: true,
                email: true,
                permanentId: true,
                tempId: true,
              },
            },
          },
        },
        draws: true,
      },
    });

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const regs = tournament.registrations;
    const totalPlayers = regs.length;
    const maleCount = regs.filter((r) => r.gender === "MALE" || r.player?.gender === "MALE").length;
    const femaleCount = regs.filter((r) => r.gender === "FEMALE" || r.player?.gender === "FEMALE").length;
    const otherCount = totalPlayers - maleCount - femaleCount;

    // Group registrations by Category / Age Group & Weight Category & Gender
    const categoryMap: Record<string, {
      ageGroup: string;
      weightCategory: string;
      gender: string;
      males: number;
      females: number;
      total: number;
      firstPlace: string[];
      secondPlace: string[];
      thirdPlace: string[];
    }> = {};

    for (const reg of regs) {
      const key = `${reg.ageGroup} | ${reg.gender} | ${reg.weightCategory}`;
      if (!categoryMap[key]) {
        categoryMap[key] = {
          ageGroup: reg.ageGroup,
          weightCategory: reg.weightCategory,
          gender: reg.gender,
          males: 0,
          females: 0,
          total: 0,
          firstPlace: [],
          secondPlace: [],
          thirdPlace: [],
        };
      }
      const cat = categoryMap[key];
      cat.total += 1;
      const g = reg.gender || reg.player?.gender;
      if (g === "MALE") cat.males += 1;
      else if (g === "FEMALE") cat.females += 1;

      const playerName = reg.player?.fullName || "Unknown";
      const clubName = reg.player?.club?.name ? ` (${reg.player.club.name})` : "";
      const playerStr = `${playerName}${clubName}`;

      if (reg.placement === "FIRST") {
        cat.firstPlace.push(playerStr);
      } else if (reg.placement === "SECOND") {
        cat.secondPlace.push(playerStr);
      } else if (reg.placement === "THIRD") {
        cat.thirdPlace.push(playerStr);
      }
    }

    // ─── Build PDF Report ──────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4 portrait
    const pageHeight = 841.89;
    const margin = 40;

    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);
    const orange = rgb(1, 0.45, 0);
    const lightLine = rgb(0.85, 0.85, 0.85);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const ensureSpace = (needed: number) => {
      if (y - needed < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };

    const drawText = (
      text: string,
      opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
    ) => {
      const { size = 10, bold = false, color = black, x = margin } = opts;
      page.drawText(text || "", { x, y, size, font: bold ? boldFont : font, color });
    };

    const drawLine = () => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: lightLine,
      });
    };

    const drawSectionHeader = (title: string) => {
      ensureSpace(40);
      y -= 10;
      drawText(title, { size: 13, bold: true, color: orange });
      y -= 6;
      drawLine();
      y -= 20;
    };

    // ── Title ──
    const title = "TOURNAMENT SUMMARY REPORT";
    const titleWidth = boldFont.widthOfTextAtSize(title, 20);
    drawText(title, { size: 20, bold: true, x: pageWidth / 2 - titleWidth / 2 });
    y -= 18;
    drawText(`Generated: ${new Date().toLocaleString()}`, { size: 9, color: gray });
    y -= 25;
    drawLine();
    y -= 25;

    // ── Tournament Info ──
    const infoRows: [string, string][] = [
      ["Tournament Title", tournament.title],
      [
        "Date",
        new Date(tournament.date).toLocaleDateString() +
          (tournament.dateTo ? ` to ${new Date(tournament.dateTo).toLocaleDateString()}` : ""),
      ],
      ["Location", tournament.location],
      ["Level", tournament.level],
      ["Category", tournament.category || "General"],
      ["Status", tournament.status],
      ["Organized By", tournament.club?.name || tournament.official?.fullName || "N/A"],
    ];
    for (const [label, value] of infoRows) {
      ensureSpace(20);
      drawText(`${label}:`, { size: 10, bold: true, x: margin });
      drawText(String(value), { size: 10, x: margin + 150 });
      y -= 18;
    }

    // ── Participation Metrics ──
    drawSectionHeader("PARTICIPATION METRICS");
    const metricRows: [string, string | number][] = [
      ["Total Players Registered", totalPlayers],
      ["Male Players", maleCount],
      ["Female Players", femaleCount],
      ["Other / Unspecified", otherCount],
      ["Total Categories / Divisions", Object.keys(categoryMap).length],
    ];
    for (const [label, value] of metricRows) {
      ensureSpace(20);
      drawText(`${label}:`, { size: 10, bold: true, x: margin });
      drawText(String(value), { size: 10, x: margin + 220 });
      y -= 18;
    }

    // ── Category Breakdown & Winners ──
    drawSectionHeader("CATEGORY BREAKDOWN & WINNERS");
    for (const cat of Object.values(categoryMap)) {
      ensureSpace(85);
      drawText(`${cat.ageGroup} · ${cat.gender} · ${cat.weightCategory}`, { size: 11, bold: true });
      y -= 16;
      drawText(`Players: ${cat.total} (M: ${cat.males}, F: ${cat.females})`, { size: 9, color: gray });
      y -= 15;
      drawText(`Gold (1st): ${cat.firstPlace.join(", ") || "N/A"}`, { size: 9 });
      y -= 14;
      drawText(`Silver (2nd): ${cat.secondPlace.join(", ") || "N/A"}`, { size: 9 });
      y -= 14;
      drawText(`Bronze (3rd): ${cat.thirdPlace.join(", ") || "N/A"}`, { size: 9 });
      y -= 22;
    }

    // ── Full Player Roster (table) ──
    drawSectionHeader("FULL PLAYER ROSTER");
    const columns = [
      { label: "TNJA ID", width: 65 },
      { label: "Name", width: 110 },
      { label: "Category", width: 105 },
      { label: "Club", width: 90 },
      { label: "District", width: 70 },
      { label: "Placement", width: 45 },
      { label: "Payment", width: 30 },
    ];

    const drawTableHeader = () => {
      ensureSpace(30);
      let colX = margin;
      for (const col of columns) {
        drawText(col.label, { size: 8.5, bold: true, x: colX, color: black });
        colX += col.width;
      }
      y -= 6;
      drawLine();
      y -= 14;
    };

    drawTableHeader();

    for (const reg of regs) {
      const pageBeforeRow = page;
      ensureSpace(16);
      if (page !== pageBeforeRow) {
        drawTableHeader();
      }
      const rowValues = [
        reg.player?.permanentId || reg.player?.tempId || "N/A",
        reg.player?.fullName || "N/A",
        `${reg.ageGroup} ${reg.gender || reg.player?.gender || ""} ${reg.weightCategory}`,
        reg.player?.club?.name || "N/A",
        reg.player?.district?.name || "N/A",
        reg.placement || "-",
        reg.isPaid ? "Paid" : "Due",
      ];
      let colX = margin;
      rowValues.forEach((val, i) => {
        const col = columns[i];
        if (!col) return;
        const maxChars = Math.floor(col.width / 4.2);
        const text = String(val).length > maxChars ? String(val).slice(0, maxChars - 1) + "…" : String(val);
        drawText(text, { size: 8, x: colX, color: gray });
        colX += col.width;
      });
      y -= 15;
    }

    const pdfBytes = await pdfDoc.save();

    const safeTitle = tournament.title.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Tournament_Report_${safeTitle}.pdf`);
    return res.end(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error generating tournament report:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

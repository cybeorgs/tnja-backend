import type { Request, Response } from "express";
import prisma from "../../database/prisma.js";
import { getAgeGroup, getWeightCategory } from "./tournament.controller.js";
import { getPlayerStanding } from "../points/points.service.js";

type ActivityStatus = "APPROVED" | "PENDING" | "REJECTED";

interface Activity {
  title: string;
  detail: string;
  status: ActivityStatus;
  date: string;
}

interface Slot {
  playerId?: string | null;
  playerName?: string;
  isBye?: boolean;
}

interface Match {
  status?: string;
  winnerId?: string | null;
  matNumber?: number;
  matchNumber?: number;
  slotA?: Slot;
  slotB?: Slot;
}

/** Application log actions a player sees, with how each reads on the dashboard. */
const LOG_ACTIVITY: Record<string, { title: string; status: ActivityStatus }> = {
  SUBMITTED: { title: "Application Submitted", status: "PENDING" },
  RESUBMITTED: { title: "Application Resubmitted", status: "PENDING" },
  CHANGES_REQUESTED: { title: "Changes Requested", status: "PENDING" },
  REPLAY: { title: "Changes Requested", status: "PENDING" },
  APPROVED: { title: "Application Approved", status: "APPROVED" },
  REJECTED: { title: "Application Rejected", status: "REJECTED" },
  BPL_REJECTED: { title: "BPL Proof Not Accepted", status: "REJECTED" },
  BPL_RESUBMITTED: { title: "BPL Proof Resubmitted", status: "PENDING" },
  BPL_DECLINED: { title: "Continued Without BPL", status: "APPROVED" },
  PAYMENT_CAPTURED: { title: "Membership Fee Paid", status: "APPROVED" },
  PERMANENT_ID_ISSUED: { title: "Player ID Issued", status: "APPROVED" },
};

const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "Senior Female -48kg" from a registration's or draw's category fields. */
function categoryLabel(ageGroup: string, gender: string, weightCategory: string): string {
  const weight = weightCategory && weightCategory !== "ALL" ? (/kg$/i.test(weightCategory) ? weightCategory : `${weightCategory}kg`) : "";
  return [titleCase(ageGroup), titleCase(gender), weight].filter(Boolean).join(" ");
}

const asStatus = (s: string): ActivityStatus => (s === "APPROVED" || s === "CLOSED" ? "APPROVED" : s === "REJECTED" ? "REJECTED" : "PENDING");

/** A draw's rounds, which older rows store as a JSON string. */
function roundsOf(raw: unknown): Match[][] {
  let rounds = raw;
  if (typeof rounds === "string") {
    try { rounds = JSON.parse(rounds); } catch { return []; }
  }
  return Array.isArray(rounds) ? rounds.filter(Array.isArray) : [];
}

// GET /api/players/me/dashboard
// Everything the player dashboard shows, in one request: membership state, match
// record from the tournament draws, recent activity and the next tournament.
export const getPlayerDashboard = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  if (role !== "PLAYER") return res.status(403).json({ error: "Only players have a player dashboard" });

  try {
    const player = await prisma.student.findUnique({
      where: { id: userId },
      select: {
        id: true, fullName: true, profilePhoto: true, status: true, permanentId: true, tempId: true,
        validUntil: true, isPaid: true, isBPL: true, gender: true, dob: true, weight: true,
        coach: { select: { id: true } },
      },
    });
    if (!player) return res.status(404).json({ error: "Player not found" });

    const [registrations, logs, settings, points] = await Promise.all([
      prisma.tournamentRegistration.findMany({
        where: { playerId: userId },
        select: {
          status: true, ageGroup: true, gender: true, weightCategory: true, createdAt: true, updatedAt: true,
          tournament: { select: { id: true, title: true, date: true, dateTo: true, location: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.applicationLog.findMany({
        where: { userId: { in: [player.tempId, player.permanentId].filter(Boolean) as string[] }, role: "PLAYER" },
        select: { action: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.globalSettings.findUnique({ where: { id: "GLOBAL" }, select: { playerFee: true } }),
      getPlayerStanding(userId, new Date().getFullYear()),
    ]);

    const draws = registrations.length
      ? await prisma.tournamentDraw.findMany({
          where: { tournamentId: { in: [...new Set(registrations.map((r) => r.tournament.id))] } },
          select: { tournamentId: true, matNumber: true, rounds: true },
        })
      : [];

    // ── Match record: bouts in the draws this player took part in (byes don't count) ──
    const stats = { matches: 0, wins: 0, losses: 0, draws: 0 };
    const nextMatchByTournament = new Map<string, { round: number; matNumber: number | null; matchNumber: number | null; opponent: string | null }>();
    for (const draw of draws) {
      roundsOf(draw.rounds).forEach((round, rIdx) => {
        for (const m of round) {
          const mine = m.slotA?.playerId === userId ? "A" : m.slotB?.playerId === userId ? "B" : null;
          if (!mine) continue;
          const opponent = mine === "A" ? m.slotB : m.slotA;
          if (opponent?.isBye) continue;

          if (m.status === "COMPLETED") {
            stats.matches++;
            if (!m.winnerId) stats.draws++;
            else if (m.winnerId === userId) stats.wins++;
            else stats.losses++;
          } else {
            const known = nextMatchByTournament.get(draw.tournamentId);
            if (!known || known.round > rIdx + 1) {
              nextMatchByTournament.set(draw.tournamentId, {
                round: rIdx + 1,
                matNumber: m.matNumber ?? draw.matNumber ?? null,
                matchNumber: m.matchNumber ?? null,
                opponent: opponent?.playerId ? opponent.playerName || null : null,
              });
            }
          }
        }
      });
    }

    // ── Membership ──
    const fee = settings?.playerFee ?? 500;
    const now = new Date();
    const needsPayment = player.status === "APPROVED" && !player.permanentId && !player.isPaid && !player.isBPL;
    const membershipState = player.permanentId
      ? player.validUntil && player.validUntil < now ? "EXPIRED" : "ACTIVE"
      : player.status !== "APPROVED"
        ? "UNDER_REVIEW"
        : needsPayment
          ? "PAYMENT_DUE"
          : "AWAITING_ID"; // paid (or BPL-exempt) and the ID is still being issued

    // ── Category: the latest live registration, else what their age and weight point to ──
    const latest = registrations.find((r) => r.status !== "REJECTED");
    let category: string | null = latest ? categoryLabel(latest.ageGroup, latest.gender, latest.weightCategory) : null;
    if (!category && player.dob) {
      const ageGroup = getAgeGroup(player.dob);
      const weight = parseFloat(player.weight || "");
      category = categoryLabel(ageGroup, player.gender, Number.isFinite(weight) ? getWeightCategory(weight, player.gender, ageGroup) : "");
    }

    // ── Recent activity ──
    const activity: Activity[] = [
      ...logs
        .filter((l) => LOG_ACTIVITY[l.action])
        .map((l) => ({
          ...LOG_ACTIVITY[l.action]!,
          detail: l.action === "PERMANENT_ID_ISSUED" && player.permanentId ? player.permanentId : "Membership",
          date: l.createdAt.toISOString(),
        })),
      ...registrations.map((r) => ({
        title: "Weight Category Registered",
        detail: `${categoryLabel(r.ageGroup, r.gender, r.weightCategory)} · ${r.tournament.title}`,
        status: asStatus(r.status),
        date: r.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    if (needsPayment) {
      activity.unshift({ title: "Payment Required", detail: `Membership Fee - ₹${fee}`, status: "PENDING", date: now.toISOString() });
    }

    // ── Next tournament: the soonest one they entered that hasn't ended ──
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = registrations
      .filter((r) => r.status !== "REJECTED" && r.tournament.status !== "REJECTED" && (r.tournament.dateTo ?? r.tournament.date) >= today)
      .sort((a, b) => a.tournament.date.getTime() - b.tournament.date.getTime())[0];

    return res.json({
      player: {
        id: player.id,
        fullName: player.fullName,
        profilePhoto: player.profilePhoto,
        status: player.status,
        playerId: player.permanentId || player.tempId,
        isPermanentId: !!player.permanentId,
        validUntil: player.validUntil,
        category,
        hasCoach: !!player.coach,
      },
      membership: { state: membershipState, fee, isBPL: player.isBPL },
      stats,
      points,
      recentActivity: activity.slice(0, 5),
      upcoming: upcoming
        ? {
            tournamentId: upcoming.tournament.id,
            title: upcoming.tournament.title,
            category: categoryLabel(upcoming.ageGroup, upcoming.gender, upcoming.weightCategory),
            date: upcoming.tournament.date,
            dateTo: upcoming.tournament.dateTo,
            location: upcoming.tournament.location,
            status: asStatus(upcoming.status),
            nextMatch: nextMatchByTournament.get(upcoming.tournament.id) ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error("[getPlayerDashboard]", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

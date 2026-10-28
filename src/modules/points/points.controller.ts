import type { Request, Response } from "express";
import type { EventLevel, Placement } from "@prisma/client";
import prisma from "../../database/prisma.js";
import { canManageTournament } from "../tournaments/tournament.controller.js";
import {
  LEVELS, PLACEMENTS, MONTH_RE, PointsError,
  awardTournamentPoints, currentMonth, deleteVolunteerShift, getPlayerStanding, getPointRules, getPointSettings,
  getRankings, previousMonth, saveMonthlyRecords, saveVolunteerShift, setSportsmanship, attendancePointsFor,
  type RankingType,
} from "./points.service.js";

const fail = (res: Response, err: unknown, where: string) => {
  if (err instanceof PointsError) return res.status(err.status).json({ error: err.message });
  console.error(`[${where}]`, err);
  return res.status(500).json({ error: "Internal Server Error" });
};

/** A coach in their office view still acts as a coach for their students. */
const isCoach = (user: any) => user.role === "COACH" || user.accountType === "COACH";

// ─── Configuration ───────────────────────────────────────────────────────────

// GET /api/points/config
export const getPointsConfig = async (_req: Request, res: Response) => {
  try {
    const [rules, settings] = await Promise.all([getPointRules(), getPointSettings()]);
    return res.json({ rules, settings });
  } catch (err) {
    return fail(res, err, "getPointsConfig");
  }
};

const SETTING_KEYS = ["sportsmanshipPoints", "volunteerPoints", "volunteerFullHours", "attendanceMaxPoints", "disciplineMaxPoints", "disciplineMinPoints"] as const;

// PUT /api/points/config   { rules: { STATE: { FIRST: 11, ... } }, settings: { ... } }
export const updatePointsConfig = async (req: Request, res: Response) => {
  const { rules, settings } = req.body ?? {};
  const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000;

  for (const level of LEVELS) {
    for (const placement of PLACEMENTS) {
      if (!isCount(rules?.[level]?.[placement])) return res.status(400).json({ error: `Points for ${level} ${placement} must be a whole number from 0 to 1000.` });
    }
  }
  for (const k of SETTING_KEYS) {
    const v = settings?.[k];
    const ok = k === "volunteerFullHours" ? typeof v === "number" && v > 0 && v <= 24 : isCount(v);
    if (!ok) return res.status(400).json({ error: `Invalid value for ${k}.` });
  }
  if (settings.disciplineMinPoints > settings.disciplineMaxPoints) {
    return res.status(400).json({ error: "Minimum discipline points cannot exceed the maximum." });
  }

  try {
    await prisma.$transaction([
      ...LEVELS.flatMap((level) =>
        PLACEMENTS.map((placement) =>
          prisma.pointRule.upsert({
            where: { level_placement: { level, placement } },
            create: { level, placement, points: rules[level][placement] },
            update: { points: rules[level][placement] },
          }),
        ),
      ),
      prisma.pointSettings.upsert({
        where: { id: "GLOBAL" },
        create: Object.fromEntries(SETTING_KEYS.map((k) => [k, settings[k]])),
        update: Object.fromEntries(SETTING_KEYS.map((k) => [k, settings[k]])),
      }),
    ]);
    return res.json({ message: "Ranking points updated. New values apply to points awarded from now on." });
  } catch (err) {
    return fail(res, err, "updatePointsConfig");
  }
};

// POST /api/points/recalculate   { season }
// Re-applies the current placement values to every tournament of a season (sportsmanship reductions are kept).
export const recalculateTournamentPoints = async (req: Request, res: Response) => {
  const season = Number(req.body?.season);
  if (!Number.isInteger(season)) return res.status(400).json({ error: "Choose a season." });
  try {
    const tournaments = await prisma.pointEntry.findMany({
      where: { season, source: "PLACEMENT", tournamentId: { not: null } },
      distinct: ["tournamentId"],
      select: { tournamentId: true },
    });
    for (const t of tournaments) await awardTournamentPoints(t.tournamentId!);
    return res.json({ message: `Tournament points recalculated for ${tournaments.length} tournament(s) in ${season}.` });
  } catch (err) {
    return fail(res, err, "recalculateTournamentPoints");
  }
};

// ─── Rankings ────────────────────────────────────────────────────────────────

const RANKING_TYPES: RankingType[] = ["student", "coach", "club", "district", "zone"];

// GET /api/rankings?type=student&season=2026|all
export const getRankingsHandler = async (req: Request, res: Response) => {
  const type = String(req.query.type || "student") as RankingType;
  if (!RANKING_TYPES.includes(type)) return res.status(400).json({ error: "Unknown ranking type" });
  const seasonParam = String(req.query.season || new Date().getFullYear());
  const season = seasonParam === "all" ? null : Number(seasonParam);
  if (season !== null && !Number.isInteger(season)) return res.status(400).json({ error: "Invalid season" });

  try {
    const [rows, seasons] = await Promise.all([
      getRankings(type, season),
      prisma.pointEntry.findMany({ distinct: ["season"], select: { season: true }, orderBy: { season: "desc" } }),
    ]);
    const thisYear = new Date().getFullYear();
    return res.json({
      type,
      season: season ?? "all",
      seasons: [...new Set([thisYear, ...seasons.map((s) => s.season)])].sort((a, b) => b - a),
      rows,
    });
  } catch (err) {
    return fail(res, err, "getRankings");
  }
};

// ─── Player ──────────────────────────────────────────────────────────────────

// GET /api/players/me/points?season=2026
export const getMyPoints = async (req: Request, res: Response) => {
  const { userId, role } = (req as any).user;
  if (role !== "PLAYER") return res.status(403).json({ error: "Only players have ranking points" });
  const season = Number(req.query.season) || new Date().getFullYear();
  try {
    const [standing, entries] = await Promise.all([
      getPlayerStanding(userId, season),
      prisma.pointEntry.findMany({
        where: { playerId: userId, season },
        select: { source: true, points: true, reason: true, month: true, updatedAt: true, tournament: { select: { title: true, level: true, date: true } } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return res.json({ ...standing, entries });
  } catch (err) {
    return fail(res, err, "getMyPoints");
  }
};

// ─── Coach: monthly attendance + discipline ──────────────────────────────────

/** Coaches may update the current and the previous month. */
const editableMonths = () => {
  const now = currentMonth();
  return [now, previousMonth(now)];
};

// GET /api/coach/monthly-records?month=2026-10
export const getMonthlyRecords = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!isCoach(user)) return res.status(403).json({ error: "Only coaches can update monthly records" });
  const month = String(req.query.month || currentMonth());
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: "Month must look like 2026-10" });

  try {
    const [settings, students] = await Promise.all([
      getPointSettings(),
      prisma.student.findMany({
        where: { coachId: user.userId, status: "APPROVED" },
        select: {
          id: true, fullName: true, permanentId: true, tempId: true, profilePhoto: true,
          monthlyRecords: { where: { month }, select: { sessionsHeld: true, sessionsAttended: true, discipline: true, updatedAt: true } },
          pointEntries: { where: { month, source: "DISCIPLINE" }, select: { points: true, reason: true } },
        },
        orderBy: { fullName: "asc" },
      }),
    ]);
    const sessionsHeld = students.find((s) => s.monthlyRecords[0])?.monthlyRecords[0]?.sessionsHeld ?? null;
    return res.json({
      month,
      editable: editableMonths().includes(month),
      editableMonths: editableMonths(),
      sessionsHeld,
      settings: { attendanceMaxPoints: settings.attendanceMaxPoints, disciplineMaxPoints: settings.disciplineMaxPoints, disciplineMinPoints: settings.disciplineMinPoints },
      students: students.map((s) => {
        const rec = s.monthlyRecords[0] ?? null;
        return {
          id: s.id,
          name: s.fullName,
          ref: s.permanentId || s.tempId,
          photo: s.profilePhoto,
          record: rec && { sessionsAttended: rec.sessionsAttended, discipline: rec.discipline, updatedAt: rec.updatedAt },
          points: rec
            ? { attendance: attendancePointsFor(settings, rec.sessionsHeld, rec.sessionsAttended), discipline: rec.discipline }
            : s.pointEntries[0] ? { attendance: 0, discipline: s.pointEntries[0].points, autoMinimum: true } : null,
        };
      }),
    });
  } catch (err) {
    return fail(res, err, "getMonthlyRecords");
  }
};

// PUT /api/coach/monthly-records   { month, sessionsHeld, records: [{ playerId, sessionsAttended, discipline }] }
export const updateMonthlyRecords = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!isCoach(user)) return res.status(403).json({ error: "Only coaches can update monthly records" });
  const { month, sessionsHeld, records } = req.body ?? {};
  if (typeof month !== "string" || !MONTH_RE.test(month)) return res.status(400).json({ error: "Month must look like 2026-10" });
  if (!editableMonths().includes(month)) return res.status(400).json({ error: "Only the current and previous month can be updated." });
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: "Add at least one student." });

  try {
    await saveMonthlyRecords(user.userId, month, Number(sessionsHeld), records.map((r: any) => ({
      playerId: String(r.playerId), sessionsAttended: Number(r.sessionsAttended), discipline: Number(r.discipline),
    })));
    return res.json({ message: `Monthly update saved for ${records.length} student(s).` });
  } catch (err) {
    return fail(res, err, "updateMonthlyRecords");
  }
};

// ─── Tournament: sportsmanship + volunteers ──────────────────────────────────

async function managedTournament(req: Request, res: Response) {
  const { userId, role } = (req as any).user;
  const tournament = await prisma.tournament.findUnique({ where: { id: String(req.params.id) } });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return null;
  }
  if (!(await canManageTournament(userId, role, tournament))) {
    res.status(403).json({ error: "You cannot manage points for this tournament" });
    return null;
  }
  return tournament;
}

// GET /api/tournaments/:id/points
export const getTournamentPoints = async (req: Request, res: Response) => {
  try {
    const tournament = await managedTournament(req, res);
    if (!tournament) return;
    const [rules, settings, regs, entries, shifts] = await Promise.all([
      getPointRules(),
      getPointSettings(),
      prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: { in: ["APPROVED", "DISQUALIFIED"] } },
        select: { playerId: true, status: true, player: { select: { fullName: true, permanentId: true, tempId: true, club: { select: { name: true } } } } },
      }),
      prisma.pointEntry.findMany({ where: { tournamentId: tournament.id }, select: { playerId: true, source: true, points: true, reason: true } }),
      prisma.volunteerShift.findMany({
        where: { tournamentId: tournament.id },
        select: { playerId: true, inTime: true, outTime: true, player: { select: { fullName: true, permanentId: true, tempId: true } } },
        orderBy: { inTime: "asc" },
      }),
    ]);

    const entryOf = (playerId: string, source: string) => entries.find((e) => e.playerId === playerId && e.source === source);
    const participants = new Map<string, any>();
    for (const r of regs) {
      const cur = participants.get(r.playerId);
      if (cur && cur.status !== "DISQUALIFIED") continue;
      const placement = entryOf(r.playerId, "PLACEMENT");
      const sports = entryOf(r.playerId, "SPORTSMANSHIP");
      participants.set(r.playerId, {
        playerId: r.playerId,
        name: r.player.fullName,
        ref: r.player.permanentId || r.player.tempId,
        club: r.player.club?.name ?? null,
        status: cur?.status === "DISQUALIFIED" ? "DISQUALIFIED" : r.status,
        placement: (placement?.reason as Placement | undefined) ?? null,
        placementPoints: placement?.points ?? null,
        sportsmanship: sports ? { points: sports.points, reason: sports.reason } : null,
      });
    }

    return res.json({
      level: tournament.level,
      levelRules: rules[tournament.level as EventLevel],
      settings: { sportsmanshipPoints: settings.sportsmanshipPoints, volunteerPoints: settings.volunteerPoints, volunteerFullHours: settings.volunteerFullHours },
      resultsSubmitted: entries.some((e) => e.source === "PLACEMENT"),
      participants: [...participants.values()].sort((a, b) => (b.placementPoints ?? -1) - (a.placementPoints ?? -1) || a.name.localeCompare(b.name)),
      volunteers: shifts.map((s) => ({
        playerId: s.playerId,
        name: s.player.fullName,
        ref: s.player.permanentId || s.player.tempId,
        inTime: s.inTime,
        outTime: s.outTime,
        points: entryOf(s.playerId, "VOLUNTEER")?.points ?? null,
      })),
    });
  } catch (err) {
    return fail(res, err, "getTournamentPoints");
  }
};

// PUT /api/tournaments/:id/sportsmanship/:playerId   { points, reason }
export const updateSportsmanship = async (req: Request, res: Response) => {
  try {
    const tournament = await managedTournament(req, res);
    if (!tournament) return;
    const { userId } = (req as any).user;
    await setSportsmanship(tournament.id, String(req.params.playerId), Number(req.body?.points), String(req.body?.reason ?? ""), userId);
    return res.json({ message: "Sportsmanship points updated." });
  } catch (err) {
    return fail(res, err, "updateSportsmanship");
  }
};

// PUT /api/tournaments/:id/volunteers   { player: "<Player ID or temporary ID>", inTime, outTime? }
export const upsertVolunteer = async (req: Request, res: Response) => {
  try {
    const tournament = await managedTournament(req, res);
    if (!tournament) return;
    const ref = String(req.body?.player ?? "").trim();
    const inTime = new Date(req.body?.inTime);
    const outTime = req.body?.outTime ? new Date(req.body.outTime) : null;
    if (!ref) return res.status(400).json({ error: "Enter the volunteer's Player ID." });
    if (isNaN(inTime.getTime()) || (outTime && isNaN(outTime.getTime()))) return res.status(400).json({ error: "Enter valid in and out times." });

    const player = await prisma.student.findFirst({
      where: { OR: [{ permanentId: { equals: ref, mode: "insensitive" } }, { tempId: { equals: ref, mode: "insensitive" } }, { id: ref }] },
      select: { id: true, fullName: true },
    });
    if (!player) return res.status(404).json({ error: `No player found with ID ${ref}.` });

    await saveVolunteerShift(tournament.id, player.id, inTime, outTime, (req as any).user.userId);
    return res.json({ message: `${player.fullName} recorded as a volunteer.` });
  } catch (err) {
    return fail(res, err, "upsertVolunteer");
  }
};

// DELETE /api/tournaments/:id/volunteers/:playerId
export const removeVolunteer = async (req: Request, res: Response) => {
  try {
    const tournament = await managedTournament(req, res);
    if (!tournament) return;
    await deleteVolunteerShift(tournament.id, String(req.params.playerId));
    return res.json({ message: "Volunteer removed." });
  } catch (err) {
    return fail(res, err, "removeVolunteer");
  }
};

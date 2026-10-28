import type { EventLevel, Placement, PointSource, Prisma } from "@prisma/client";
import prisma from "../../database/prisma.js";

/**
 * Ranking points. Every point is a PointEntry row with a unique `key` per source
 * and occasion, so each award is an upsert and running it again never counts twice.
 * Values always come from PointRule / PointSettings (Configuration → Ranking Points).
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const PLACEMENTS: Placement[] = ["FIRST", "SECOND", "THIRD", "PARTICIPATION"];
export const LEVELS: EventLevel[] = ["CLUB", "DISTRICT", "ZONE", "STATE", "NATIONAL"];

const PLACEMENT_RANK: Record<Placement, number> = { FIRST: 4, SECOND: 3, THIRD: 2, PARTICIPATION: 1 };

export const keys = {
  placement: (tournamentId: string, playerId: string) => `PLACEMENT:${tournamentId}:${playerId}`,
  sportsmanship: (tournamentId: string, playerId: string) => `SPORTSMANSHIP:${tournamentId}:${playerId}`,
  volunteer: (tournamentId: string, playerId: string) => `VOLUNTEER:${tournamentId}:${playerId}`,
  attendance: (month: string, playerId: string) => `ATTENDANCE:${month}:${playerId}`,
  discipline: (month: string, playerId: string) => `DISCIPLINE:${month}:${playerId}`,
};

export type PointSettingsValues = {
  sportsmanshipPoints: number;
  volunteerPoints: number;
  volunteerFullHours: number;
  attendanceMaxPoints: number;
  disciplineMaxPoints: number;
  disciplineMinPoints: number;
};

export async function getPointSettings(db: Db = prisma): Promise<PointSettingsValues> {
  const s = await db.pointSettings.upsert({ where: { id: "GLOBAL" }, create: {}, update: {} });
  return s;
}

/** points[level][placement] */
export async function getPointRules(db: Db = prisma): Promise<Record<EventLevel, Record<Placement, number>>> {
  const rows = await db.pointRule.findMany();
  const table = Object.fromEntries(LEVELS.map((l) => [l, Object.fromEntries(PLACEMENTS.map((p) => [p, 0]))])) as Record<EventLevel, Record<Placement, number>>;
  for (const r of rows) table[r.level][r.placement] = r.points;
  return table;
}

// ─── Who the player belongs to when the points are earned ─────────────────────

const OWNER_SELECT = { coachId: true, clubId: true, districtId: true, district: { select: { zoneName: true } } } as const;
type Owner = { coachId: string | null; clubId: string | null; districtId: string; district: { zoneName: string | null } };

const snapshot = (p: Owner) => ({ coachId: p.coachId, clubId: p.clubId, districtId: p.districtId, zoneName: p.district.zoneName });

/** "2026-10" → 2026 */
const seasonOfMonth = (month: string) => Number(month.slice(0, 4));

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ─── Tournament: placement + sportsmanship ───────────────────────────────────

/**
 * (Re)awards a tournament's placement and sportsmanship points. Called whenever
 * results are submitted or a player is disqualified.
 *
 * - A player gets points for their best result only, even across several categories.
 * - Every approved participant starts with the sportsmanship default; a reduction an
 *   official already made is kept.
 * - A disqualified player (or one no longer approved) gets nothing for this tournament.
 */
export async function awardTournamentPoints(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { level: true, date: true } });
  if (!tournament) return;

  const [rules, settings, regs] = await Promise.all([
    getPointRules(),
    getPointSettings(),
    prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      select: { playerId: true, status: true, placement: true, player: { select: OWNER_SELECT } },
    }),
  ]);

  const byPlayer = new Map<string, { owner: Owner; best: Placement | null; disqualified: boolean }>();
  for (const r of regs) {
    const cur = byPlayer.get(r.playerId) ?? { owner: r.player, best: null, disqualified: false };
    if (r.status === "DISQUALIFIED") cur.disqualified = true;
    if (r.status === "APPROVED") {
      const placement = r.placement ?? "PARTICIPATION";
      if (!cur.best || PLACEMENT_RANK[placement] > PLACEMENT_RANK[cur.best]) cur.best = placement;
    }
    byPlayer.set(r.playerId, cur);
  }

  const season = tournament.date.getFullYear();
  await prisma.$transaction(async (tx) => {
    for (const [playerId, { owner, best, disqualified }] of byPlayer) {
      const placementKey = keys.placement(tournamentId, playerId);
      const sportsKey = keys.sportsmanship(tournamentId, playerId);
      if (disqualified || !best) {
        await tx.pointEntry.deleteMany({ where: { key: { in: [placementKey, sportsKey] } } });
        continue;
      }
      const base = { playerId, season, tournamentId, ...snapshot(owner) };
      const points = rules[tournament.level][best];
      await tx.pointEntry.upsert({
        where: { key: placementKey },
        create: { ...base, key: placementKey, source: "PLACEMENT", points, reason: best },
        update: { ...base, points, reason: best },
      });
      await tx.pointEntry.upsert({
        where: { key: sportsKey },
        create: { ...base, key: sportsKey, source: "SPORTSMANSHIP", points: settings.sportsmanshipPoints },
        update: {},
      });
    }
  });
}

/** Sets a participant's sportsmanship points for one tournament (0..default), with a reason. */
export async function setSportsmanship(tournamentId: string, playerId: string, points: number, reason: string, enteredBy: string) {
  const settings = await getPointSettings();
  if (!Number.isInteger(points) || points < 0 || points > settings.sportsmanshipPoints) {
    throw new PointsError(400, `Sportsmanship points must be a whole number from 0 to ${settings.sportsmanshipPoints}.`);
  }
  const reduced = points < settings.sportsmanshipPoints;
  if (reduced && !reason.trim()) throw new PointsError(400, "Give a reason for reducing sportsmanship points.");

  const { count } = await prisma.pointEntry.updateMany({
    where: { key: keys.sportsmanship(tournamentId, playerId) },
    data: { points, reason: reduced ? reason.trim() : null, enteredBy },
  });
  if (count === 0) throw new PointsError(409, "Points for this player are awarded once results are submitted.");
}

// ─── Volunteering ────────────────────────────────────────────────────────────

/** Full points for a shift of at least volunteerFullHours; shorter shifts earn pro rata. */
export function volunteerPointsFor(settings: PointSettingsValues, inTime: Date, outTime: Date): number {
  const hours = Math.max(0, (outTime.getTime() - inTime.getTime()) / 3_600_000);
  const share = settings.volunteerFullHours > 0 ? Math.min(1, hours / settings.volunteerFullHours) : 1;
  return Math.round(settings.volunteerPoints * share);
}

export async function saveVolunteerShift(tournamentId: string, playerId: string, inTime: Date, outTime: Date | null, recordedBy: string) {
  if (outTime && outTime <= inTime) throw new PointsError(400, "Out time must be after in time.");
  const [tournament, player, settings] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { date: true } }),
    prisma.student.findUnique({ where: { id: playerId }, select: { status: true, ...OWNER_SELECT } }),
    getPointSettings(),
  ]);
  if (!tournament) throw new PointsError(404, "Tournament not found");
  if (!player || player.status !== "APPROVED") throw new PointsError(404, "Only approved players can be recorded as volunteers.");

  const key = keys.volunteer(tournamentId, playerId);
  await prisma.$transaction(async (tx) => {
    await tx.volunteerShift.upsert({
      where: { tournamentId_playerId: { tournamentId, playerId } },
      create: { tournamentId, playerId, inTime, outTime, recordedBy },
      update: { inTime, outTime, recordedBy },
    });
    if (!outTime) {
      await tx.pointEntry.deleteMany({ where: { key } });
      return;
    }
    const data = {
      playerId, tournamentId, season: tournament.date.getFullYear(), source: "VOLUNTEER" as PointSource,
      points: volunteerPointsFor(settings, inTime, outTime), enteredBy: recordedBy, ...snapshot(player),
    };
    await tx.pointEntry.upsert({ where: { key }, create: { ...data, key }, update: data });
  });
}

export async function deleteVolunteerShift(tournamentId: string, playerId: string) {
  await prisma.$transaction([
    prisma.volunteerShift.deleteMany({ where: { tournamentId, playerId } }),
    prisma.pointEntry.deleteMany({ where: { key: keys.volunteer(tournamentId, playerId) } }),
  ]);
}

// ─── Coach's monthly update: attendance + discipline ─────────────────────────

export function attendancePointsFor(settings: PointSettingsValues, held: number, attended: number): number {
  return held > 0 ? Math.round(settings.attendanceMaxPoints * Math.min(1, attended / held)) : 0;
}

export interface MonthlyInput {
  playerId: string;
  sessionsAttended: number;
  discipline: number;
}

/** Saves a coach's monthly update for their students and (re)writes the matching points. */
export async function saveMonthlyRecords(coachId: string, month: string, sessionsHeld: number, records: MonthlyInput[]) {
  const settings = await getPointSettings();
  if (!Number.isInteger(sessionsHeld) || sessionsHeld < 0 || sessionsHeld > 62) throw new PointsError(400, "Sessions held must be a whole number from 0 to 62.");
  for (const r of records) {
    if (!Number.isInteger(r.sessionsAttended) || r.sessionsAttended < 0 || r.sessionsAttended > sessionsHeld) {
      throw new PointsError(400, `Sessions attended must be from 0 to ${sessionsHeld}.`);
    }
    if (!Number.isInteger(r.discipline) || r.discipline < 0 || r.discipline > settings.disciplineMaxPoints) {
      throw new PointsError(400, `Discipline must be from 0 to ${settings.disciplineMaxPoints}.`);
    }
  }

  const players = await prisma.student.findMany({
    where: { id: { in: records.map((r) => r.playerId) }, coachId, status: "APPROVED" },
    select: { id: true, ...OWNER_SELECT },
  });
  const owned = new Map(players.map((p) => [p.id, p]));
  if (owned.size !== new Set(records.map((r) => r.playerId)).size) throw new PointsError(403, "You can only update your own students.");

  const season = seasonOfMonth(month);
  await prisma.$transaction(async (tx) => {
    for (const r of records) {
      const owner = owned.get(r.playerId)!;
      await tx.monthlyRecord.upsert({
        where: { playerId_month: { playerId: r.playerId, month } },
        create: { playerId: r.playerId, month, sessionsHeld, sessionsAttended: r.sessionsAttended, discipline: r.discipline, coachId },
        update: { sessionsHeld, sessionsAttended: r.sessionsAttended, discipline: r.discipline, coachId },
      });
      const base = { playerId: r.playerId, season, month, enteredBy: coachId, reason: null, ...snapshot(owner) };
      const att = { ...base, source: "ATTENDANCE" as PointSource, points: attendancePointsFor(settings, sessionsHeld, r.sessionsAttended) };
      const dis = { ...base, source: "DISCIPLINE" as PointSource, points: r.discipline };
      const attKey = keys.attendance(month, r.playerId);
      const disKey = keys.discipline(month, r.playerId);
      await tx.pointEntry.upsert({ where: { key: attKey }, create: { ...att, key: attKey }, update: att });
      await tx.pointEntry.upsert({ where: { key: disKey }, create: { ...dis, key: disKey }, update: dis });
    }
  });
}

/**
 * Gives the minimum discipline points to every approved player whose coach did
 * not update a finished month. A coach's later update replaces it.
 * @returns how many players received the minimum
 */
export async function closeMonth(month: string): Promise<number> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const monthEnd = new Date(y, m, 1); // first day of the next month
  const settings = await getPointSettings();
  const players = await prisma.student.findMany({
    where: { status: "APPROVED", createdAt: { lt: monthEnd }, monthlyRecords: { none: { month } } },
    select: { id: true, ...OWNER_SELECT },
  });
  if (players.length === 0) return 0;
  const { count } = await prisma.pointEntry.createMany({
    data: players.map((p) => ({
      key: keys.discipline(month, p.id),
      playerId: p.id,
      source: "DISCIPLINE" as PointSource,
      points: settings.disciplineMinPoints,
      season: y,
      month,
      reason: "Coach did not update this month",
      ...snapshot(p),
    })),
    skipDuplicates: true,
  });
  return count;
}

/** Closes the last two finished months now and every six hours (each run is idempotent). */
export function startMonthCloser() {
  const run = async () => {
    try {
      const last = previousMonth(currentMonth());
      for (const month of [previousMonth(last), last]) {
        const n = await closeMonth(month);
        if (n > 0) console.log(`[Points] ${month}: minimum discipline points given to ${n} players without a coach update`);
      }
    } catch (err) {
      console.error("[Points] Month close failed:", err);
    }
  };
  run();
  setInterval(run, 6 * 3_600_000).unref();
}

// ─── Rankings ────────────────────────────────────────────────────────────────

export type RankingType = "student" | "coach" | "club" | "district" | "zone";
const GROUP_FIELD = { student: "playerId", coach: "coachId", club: "clubId", district: "districtId", zone: "zoneName" } as const;
export const SOURCES: PointSource[] = ["PLACEMENT", "SPORTSMANSHIP", "VOLUNTEER", "ATTENDANCE", "DISCIPLINE"];

export interface RankingRow {
  rank: number;
  id: string;
  name: string;
  subtitle: string | null;
  points: number;
  breakdown: Record<PointSource, number>;
  players?: number;
}

/** Ranked totals for a season (or all time when season is null); ties share a rank. */
export async function getRankings(type: RankingType, season: number | null, limit = 100): Promise<RankingRow[]> {
  const field = GROUP_FIELD[type];
  // playerId is always set; the snapshot fields can be empty (a player with no coach or club).
  const where: Prisma.PointEntryWhereInput = { ...(season ? { season } : {}), ...(type !== "student" && { [field]: { not: null } }) };

  const grouped = await prisma.pointEntry.groupBy({ by: [field, "source"], where, _sum: { points: true } });
  const totals = new Map<string, { points: number; breakdown: Record<PointSource, number> }>();
  for (const g of grouped as unknown as ({ source: PointSource; _sum: { points: number | null } } & Record<string, string>)[]) {
    const id = g[field]!;
    const row = totals.get(id) ?? { points: 0, breakdown: Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<PointSource, number> };
    const pts = g._sum.points ?? 0;
    row.points += pts;
    row.breakdown[g.source] += pts;
    totals.set(id, row);
  }

  const ids = [...totals.keys()];
  const playerCounts = type === "student" ? null : new Map(
    (await prisma.pointEntry.groupBy({ by: [field, "playerId"], where })).reduce((acc, g) => {
      const id = (g as Record<string, string>)[field]!;
      acc.set(id, (acc.get(id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  );
  const names = await resolveNames(type, ids);

  const sorted = ids
    .map((id) => ({ id, ...totals.get(id)!, ...(names.get(id) ?? { name: id, subtitle: null }) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  let rank = 0;
  let prev: number | null = null;
  return sorted.slice(0, limit).map((r, i) => {
    if (r.points !== prev) rank = i + 1;
    prev = r.points;
    return { rank, ...r, ...(playerCounts && { players: playerCounts.get(r.id) ?? 0 }) };
  });
}

async function resolveNames(type: RankingType, ids: string[]): Promise<Map<string, { name: string; subtitle: string | null }>> {
  if (ids.length === 0) return new Map();
  switch (type) {
    case "student": {
      const rows = await prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, permanentId: true, tempId: true, district: { select: { name: true } }, club: { select: { name: true } } },
      });
      return new Map(rows.map((r) => [r.id, { name: r.fullName, subtitle: [r.permanentId || r.tempId, r.club?.name, r.district.name].filter(Boolean).join(" · ") }]));
    }
    case "coach": {
      const rows = await prisma.coachReferee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, permanentId: true, district: { select: { name: true } } } });
      return new Map(rows.map((r) => [r.id, { name: r.fullName, subtitle: [r.permanentId, r.district.name].filter(Boolean).join(" · ") }]));
    }
    case "club": {
      const rows = await prisma.club.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, district: { select: { name: true } } } });
      return new Map(rows.map((r) => [r.id, { name: r.name, subtitle: r.district?.name ?? null }]));
    }
    case "district": {
      const rows = await prisma.district.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, zoneName: true } });
      return new Map(rows.map((r) => [r.id, { name: r.name, subtitle: r.zoneName }]));
    }
    case "zone":
      return new Map(ids.map((id) => [id, { name: id, subtitle: null }]));
  }
}

/** A player's season total, breakdown and rank among students. */
export async function getPlayerStanding(playerId: string, season: number) {
  const ranking = await getRankings("student", season, Number.MAX_SAFE_INTEGER);
  const row = ranking.find((r) => r.id === playerId);
  return {
    season,
    points: row?.points ?? 0,
    breakdown: row?.breakdown ?? (Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<PointSource, number>),
    rank: row?.rank ?? null,
    rankedPlayers: ranking.length,
  };
}

export class PointsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Age groups and weight classes ───────────────────────────────────────────
// Ported from the standalone tournament app (E:\tnja-tournament\Tnja-backend\src\lib\categories.ts).
//
// Categories go by BIRTH YEAR only: the month and day of birth never matter. Age is counted as
// (tournament year − birth year), so the same table stays valid every season instead of
// hard-coding birth years. For a 2026 tournament this gives (TNJA circular):
//   Mini Sub-Junior I 2019–2020 · II 2017–2018 · III 2015–2016 · Sub-Junior 2012–2014
//   Cadet 2010–2012 · Junior 2007–2009 (cadets 2010–2012 may play up) · Senior 2006 and earlier
//   (players born 2011 and earlier may play up)

export type Gender = "MALE" | "FEMALE";

export interface AgeGroupDef {
  name: string;
  minAge: number;
  maxAge: number;
  /** Younger players may "play up" into this group from this age (e.g. a 15-year-old cadet may also enter
   *  Junior and Senior). Defaults to minAge: only the group's own ages. */
  playUpFrom?: number;
  /** Upper limits in kg; the last class is "+<last limit>kg". */
  weights: { MALE: number[]; FEMALE: number[] };
}

export const AGE_GROUPS: AgeGroupDef[] = [
  // Per the TNJA circular (Super Trophy Judo Championship 2026-27). Classes are upper limits; the last is "over".
  { name: "Mini Sub-Junior Age Group 1", minAge: 6, maxAge: 7, weights: { MALE: [20, 25, 30], FEMALE: [18, 22, 26] } },
  { name: "Mini Sub-Junior Age Group 2", minAge: 8, maxAge: 9, weights: { MALE: [25, 30, 35], FEMALE: [22, 26, 30] } },
  { name: "Mini Sub-Junior Age Group 3", minAge: 10, maxAge: 11, weights: { MALE: [30, 35, 40, 45], FEMALE: [28, 32, 36, 40] } },
  { name: "Sub-Junior", minAge: 12, maxAge: 14, weights: { MALE: [30, 35, 40, 45, 50, 55, 60, 66], FEMALE: [28, 32, 36, 40, 44, 48, 52, 57] } },
  // Cadets (14–16) may also enter Junior (from 14) and Senior (from 15); juniors (17–19) Junior and Senior; seniors (20+) Senior only.
  { name: "Cadet", minAge: 14, maxAge: 16, weights: { MALE: [50, 55, 60, 66, 73, 81, 90], FEMALE: [40, 44, 48, 52, 57, 63, 70] } },
  { name: "Junior", minAge: 17, maxAge: 19, playUpFrom: 14, weights: { MALE: [55, 60, 66, 73, 81, 90, 100], FEMALE: [44, 48, 52, 57, 63, 70, 78] } },
  { name: "Senior", minAge: 20, maxAge: 120, playUpFrom: 15, weights: { MALE: [60, 66, 73, 81, 90, 100], FEMALE: [48, 52, 57, 63, 70, 78] } },
];

export const AGE_GROUP_NAMES = AGE_GROUPS.map((g) => g.name);

export function findAgeGroup(name: string): AgeGroupDef | undefined {
  return AGE_GROUPS.find((g) => g.name === name);
}

/** True when a player of competition age `age` may enter `group` (its own ages, or playing up). */
export function canEnter(group: AgeGroupDef, age: number): boolean {
  return age >= (group.playUpFrom ?? group.minAge) && age <= group.maxAge;
}

/** Birth year as entered: dates of birth are stored as midnight UTC, so read the UTC year (never the server's time zone). */
export const birthYear = (dob: Date) => dob.getUTCFullYear();

/** The calendar year of a moment in India (a tournament starting 1 Jan 00:30 IST is that new year). */
export const yearInIndia = (d: Date) => Number(d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }));

/** Tournament year − birth year. Month and day of birth are ignored. */
export function competitionAge(dob: Date, tournamentDate: Date): number {
  return yearInIndia(tournamentDate) - birthYear(dob);
}

export const toGender = (gender: string | null | undefined): Gender => (gender === "FEMALE" ? "FEMALE" : "MALE");

// ─── Tournament.category ─────────────────────────────────────────────────────
// Stored as a comma-separated list of age-group names. Older tournaments were saved with the
// create form's short labels ("Mini Sub Junior", "Sub Junior"), which never matched the names
// above; map them so those tournaments keep working.

const LEGACY_NAMES: Record<string, string[]> = {
  "mini sub junior": AGE_GROUP_NAMES.filter((n) => n.startsWith("Mini Sub-Junior")),
  "sub junior": ["Sub-Junior"],
  veteran: ["Senior"],
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Canonical age-group names for one label, or [] when it is not an age group. */
function resolveName(label: string): string[] {
  const k = key(label);
  if (!k) return [];
  const exact = AGE_GROUPS.find((g) => key(g.name) === k);
  if (exact) return [exact.name];
  return LEGACY_NAMES[k] ?? [];
}

/** Age groups a tournament contests, in table order. Empty when it did not restrict them (then all are open). */
export function tournamentAgeGroups(category: string | string[] | null | undefined): string[] {
  const labels = Array.isArray(category) ? category : (category ?? "").split(",");
  const picked = new Set(labels.flatMap((l) => resolveName(String(l))));
  return AGE_GROUP_NAMES.filter((n) => picked.has(n));
}

/** Validates the create/edit form's categories and returns what to store, or an error for unknown names. */
export function normalizeCategoryInput(category: unknown): { value: string | null } | { error: string } {
  if (category === undefined || category === null || category === "") return { value: null };
  const labels = Array.isArray(category) ? category.map(String) : String(category).split(",");
  const unknown = labels.map((l) => l.trim()).filter((l) => l && !resolveName(l).length);
  if (unknown.length) return { error: `Unknown age group: ${unknown.join(", ")}` };
  const groups = tournamentAgeGroups(labels);
  return { value: groups.length ? groups.join(", ") : null };
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

/** Age groups a player born on `dob` may enter for a tournament on `tournamentDate`, limited to the
 *  tournament's own age groups when it set any. */
export function eligibleAgeGroups(dob: Date, tournamentDate: Date, tournamentCategory?: string | string[] | null): string[] {
  const age = competitionAge(dob, tournamentDate);
  const allowed = tournamentAgeGroups(tournamentCategory);
  return AGE_GROUPS.filter((g) => (!allowed.length || allowed.includes(g.name)) && canEnter(g, age)).map((g) => g.name);
}

/** The group whose own age band contains the player's age (e.g. 16 → Cadet), ignoring play-up. */
export function ownAgeGroup(dob: Date, onDate: Date = new Date()): string | undefined {
  const age = competitionAge(dob, onDate);
  return AGE_GROUPS.find((g) => age >= g.minAge && age <= g.maxAge)?.name;
}

/**
 * The age group a registration goes into: the requested one if the player may enter it, otherwise
 * (nothing requested) the player's own group, or the youngest one they may play up into.
 */
export function resolveAgeGroup(
  dob: Date | null | undefined,
  tournament: { date: Date; category?: string | null },
  requested?: string | null,
): { ageGroup: string } | { error: string } {
  if (!dob) return { error: "Date of birth is missing on the player's profile, so their age group cannot be worked out" };
  const eligible = eligibleAgeGroups(dob, tournament.date, tournament.category);
  const age = competitionAge(dob, tournament.date);
  if (requested) {
    const [name] = resolveName(requested);
    if (name && eligible.includes(name)) return { ageGroup: name };
    return { error: `Born ${birthYear(dob)} (age ${age} for this tournament): not eligible for ${requested}` };
  }
  if (!eligible.length) {
    const offered = tournamentAgeGroups(tournament.category);
    return { error: `Born ${birthYear(dob)} (age ${age} for this tournament): no age group${offered.length ? ` in ${offered.join(", ")}` : ""} fits` };
  }
  const own = eligible.find((n) => {
    const g = findAgeGroup(n)!;
    return age >= g.minAge && age <= g.maxAge;
  });
  return { ageGroup: own ?? eligible[0]! };
}

// ─── Weight classes ──────────────────────────────────────────────────────────

/** Unknown names (e.g. old "Veteran" entries) use the Senior table. */
const weightTable = (ageGroup: string) => findAgeGroup(ageGroup) ?? findAgeGroup("Senior")!;

export function weightClasses(ageGroup: string, gender: string): string[] {
  const limits = weightTable(ageGroup).weights[toGender(gender)];
  return [...limits.map((l) => `-${l}kg`), `+${limits[limits.length - 1]}kg`];
}

export function weightCategoryFor(weightKg: number, gender: string, ageGroup: string): string {
  const limits = weightTable(ageGroup).weights[toGender(gender)];
  const limit = limits.find((l) => weightKg <= l);
  return limit !== undefined ? `-${limit}kg` : `+${limits[limits.length - 1]}kg`;
}

// Bulk import of a tournament "Entries" export (as downloaded from the standalone tournament app):
// Student IDs there ("TNJA-S-001044") are not IDs this backend issues, Aadhaar is masked, and the
// Email / Phone columns usually hold the coach's or club's contact, shared by many players.
// The real controller runs against an in-memory database stub with the same unique columns as Student.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import xlsx from "xlsx";

// An unreachable database: any query that isn't stubbed below fails the test instead of touching real data.
process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none";

// ─── In-memory database ──────────────────────────────────────────────────────
type Row = Record<string, any>;
const db: { student: Row[]; tournamentRegistration: Row[] } = { student: [], tournamentRegistration: [] };
const STUDENT_UNIQUE = ["tempId", "permanentId", "mobileNumber", "email", "aadhaarNumber"];
const latency = () => new Promise((r) => setTimeout(r, 1)); // real queries yield; so must the stub

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Row[]).some((c) => matches(row, c));
    if (k === "AND") return (cond as Row[]).every((c) => matches(row, c));
    if (k === "NOT") return !matches(row, cond);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("equals" in cond) {
        return cond.mode === "insensitive"
          ? String(row[k] ?? "").toLowerCase() === String(cond.equals).toLowerCase()
          : row[k] === cond.equals;
      }
      if ("in" in cond) return cond.in.includes(row[k]);
      if ("not" in cond) return row[k] !== cond.not;
    }
    if (cond instanceof Date) return row[k] instanceof Date && row[k].getTime() === cond.getTime();
    return row[k] === cond;
  });
}

function table(rows: () => Row[], unique: string[]) {
  return {
    findUnique: async ({ where }: Row) => { await latency(); return rows().find((r) => matches(r, where)) ?? null; },
    findFirst: async ({ where }: Row = {}) => { await latency(); return rows().find((r) => matches(r, where)) ?? null; },
    findMany: async ({ where }: Row = {}) => { await latency(); return rows().filter((r) => matches(r, where)); },
    count: async ({ where }: Row = {}) => { await latency(); return rows().filter((r) => matches(r, where)).length; },
    create: async ({ data }: Row) => {
      await latency();
      for (const col of unique) {
        if (data[col] != null && rows().some((r) => r[col] === data[col])) {
          throw new Error(`Unique constraint failed on the fields: (\`${col}\`)`);
        }
      }
      const row = { id: `id-${Math.random().toString(36).slice(2)}`, ...data };
      rows().push(row);
      return row;
    },
  };
}

const TOURNAMENT = {
  id: "t1", name: "Test Championship", date: new Date("2026-12-15T00:00:00Z"), dateTo: new Date("2026-12-16T00:00:00Z"),
  category: null, registrationClosed: false, clubId: null, officialId: null, officialCoachId: null, level: "STATE",
};
const DISTRICT = { id: "d-chennai", name: "Chennai", code: "CHN" };
const TALUK = { id: "tk-chennai", name: "Chennai", districtId: DISTRICT.id };

const prisma = (await import("../src/database/prisma.ts")).default as any;
const stub = (model: string, value: unknown) => Object.defineProperty(prisma, model, { value, configurable: true });
stub("student", table(() => db.student, STUDENT_UNIQUE));
stub("tournamentRegistration", table(() => db.tournamentRegistration, []));
stub("tournament", { findUnique: async () => TOURNAMENT });
stub("district", table(() => [DISTRICT], []));
stub("taluk", table(() => [TALUK], []));
stub("club", { findFirst: async () => null });
stub("coachReferee", { findFirst: async () => null });

const { bulkImportRegistrations } = await import("../src/modules/tournaments/tournament.controller.ts");

// ─── Sheet in the Entries-export layout ──────────────────────────────────────
const HEADERS = ["Student ID", "Full name", "Gender", "Date of birth", "Age group", "Category", "Weight class",
  "Weight entered (kg)", "Club", "District", "Phone", "Email", "Blood group", "Aadhaar", "Type", "Payment"];
const excelDate = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569;

interface Entry { id: string; name: string; gender: "MALE" | "FEMALE"; dob: string; ageGroup: string; weight: number; phone: string; email: string }
const toRow = (e: Entry) => [e.id, e.name, e.gender, excelDate(e.dob), e.ageGroup, e.gender === "FEMALE" ? "Girls" : "Boys", "",
  e.weight, "Test Club", "Chennai", e.phone, e.email, "O+ve", "XXXX XXXX 1234", "Student", "Paid"];

async function importSheet(entries: Entry[]) {
  const ws = xlsx.utils.aoa_to_sheet([HEADERS, ...entries.map(toRow)]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Entries");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bulk-")), "entries.xlsx");
  xlsx.writeFile(wb, file);

  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  await bulkImportRegistrations({ user: { userId: "admin", role: "SUPER_ADMIN" }, params: { id: TOURNAMENT.id }, file: { path: file } } as any, res);
  return res.body as { successCount: number; failedCount: number; errors: { row: number; error: string }[] };
}

/** Who actually got registered: player name → age groups. */
const registered = () => {
  const out: Record<string, string[]> = {};
  for (const r of db.tournamentRegistration) {
    const name = db.student.find((s) => s.id === r.playerId)!.fullName;
    (out[name] ??= []).push(r.ageGroup);
  }
  for (const k of Object.keys(out)) out[k]!.sort();
  return out;
};

// Synthetic players. Coach contact is shared, the way the real export has it.
const COACH_PHONE = "9000000001";
const COACH_EMAIL = "coach.test@example.com";
const anu: Entry = { id: "TNJA-S-900001", name: "Anu Test", gender: "FEMALE", dob: "2010-05-01", ageGroup: "Cadet", weight: 45, phone: COACH_PHONE, email: COACH_EMAIL };
const bala: Entry = { id: "TNJA-S-900002", name: "Bala Test", gender: "MALE", dob: "2013-03-10", ageGroup: "Sub-Junior", weight: 38, phone: COACH_PHONE, email: COACH_EMAIL };
const chitra: Entry = { id: "TNJA-S-900003", name: "Chitra Test", gender: "FEMALE", dob: "2012-08-20", ageGroup: "Sub-Junior", weight: 40, phone: COACH_PHONE, email: "chitra.parent@example.com" };
const deepa: Entry = { id: "TNJA-S-900004", name: "Deepa Test", gender: "FEMALE", dob: "2011-01-15", ageGroup: "Cadet", weight: 50, phone: "9000000004", email: "deepa@example.com" };

beforeEach(() => { db.student.length = 0; db.tournamentRegistration.length = 0; });

// ─── Tests ───────────────────────────────────────────────────────────────────
test("control: a player with their own phone and email, entered in Cadet and Junior, gets both entries", async () => {
  const body = await importSheet([deepa, { ...deepa, ageGroup: "Junior" }]);
  assert.deepEqual(body.errors, []);
  assert.deepEqual(registered(), { "Deepa Test": ["Cadet", "Junior"] });
});

test("two players sharing the coach's phone AND email are both registered, each as themselves", async () => {
  const body = await importSheet([anu, bala]);
  assert.deepEqual(body.errors, [], "no row should fail");
  assert.deepEqual(registered(), { "Anu Test": ["Cadet"], "Bala Test": ["Sub-Junior"] });
  assert.equal(db.student.length, 2);
});

test("a player sharing only the coach's phone (own email) is registered as themselves", async () => {
  const body = await importSheet([anu, chitra]);
  assert.deepEqual(body.errors, [], "no row should fail");
  assert.deepEqual(registered(), { "Anu Test": ["Cadet"], "Chitra Test": ["Sub-Junior"] });
});

test("an existing player holding the coach's email does not swallow another player's row", async () => {
  await importSheet([anu]); // first upload: Anu is created with the coach's phone and email
  const body = await importSheet([bala]); // later upload of Bala, same coach contact
  assert.deepEqual(body.errors, [], "Bala's row should not fail");
  assert.deepEqual(registered(), { "Anu Test": ["Cadet"], "Bala Test": ["Sub-Junior"] });
});

test("re-uploading the same sheet creates no duplicate players and reports 'already registered'", async () => {
  await importSheet([anu, bala, chitra, deepa]);
  const players = db.student.length;
  const regs = db.tournamentRegistration.length;
  const body = await importSheet([anu, bala, chitra, deepa]);
  assert.equal(body.successCount, 0);
  assert.equal(db.student.length, players, "no new players on a re-upload");
  assert.equal(db.tournamentRegistration.length, regs, "no new registrations on a re-upload");
  assert.ok(body.errors.every((e) => /already registered/.test(e.error)), JSON.stringify(body.errors));
});

test("many players behind one coach contact (like the real sheet: up to 18 per phone) all import", async () => {
  const kids: Entry[] = Array.from({ length: 18 }, (_, i) => ({
    id: `TNJA-S-91${String(i).padStart(4, "0")}`, name: `Kid ${i} Test`, gender: i % 2 ? "MALE" : "FEMALE",
    dob: `201${3 + (i % 2)}-0${1 + (i % 9)}-1${i % 10}`, ageGroup: "Sub-Junior", weight: 30 + i, phone: COACH_PHONE, email: COACH_EMAIL,
  }));
  const body = await importSheet(kids);
  assert.deepEqual(body.errors, []);
  assert.equal(Object.keys(registered()).length, 18);
});

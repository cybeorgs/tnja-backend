// DigiLocker controllers with a mocked Sandbox and stubbed database lookups: per-session
// throttle, shared in-flight checks and the verified-result cache (F4), session-start dedupe,
// and the rate limits in front of them.
import { calls, count, useRoutes, authOk, type Reply } from "./helpers/sandboxMock.ts";
import { test } from "node:test";
import assert from "node:assert/strict";

// An unreachable database: any query that isn't stubbed below fails the test instead of touching real data.
process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none";

const prisma = (await import("../src/database/prisma.ts")).default as any;
for (const [model, method] of [["blockedAadhaar", "findUnique"], ["student", "findFirst"], ["coachReferee", "findFirst"], ["member", "findFirst"], ["club", "findFirst"]] as const) {
  Object.defineProperty(prisma, model, { value: { [method]: async () => null }, configurable: true });
}
const { startAadhaarDigilocker, checkAadhaarDigilocker } = await import("../src/modules/auth/auth.controller.ts");
const { createDigilockerSessionToken } = await import("../src/helpers/aadhaar.helper.ts");
const { limits } = await import("../src/middleware/rateLimit.ts");

// Throttles and token lifetimes use Date.now(); move the clock instead of waiting.
let offset = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + offset;
const advance = (ms: number) => { offset += ms; };

const AADHAAR = "234567890123"; // format-valid, test only
const OTHER_AADHAAR = "298765432109";

function mockRes() {
  const r: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
}
async function check(sessionId: string, aadhaar = AADHAAR, token = createDigilockerSessionToken(aadhaar, sessionId)) {
  const r = mockRes();
  await checkAadhaarDigilocker({ body: { aadhaarNumber: aadhaar, digilockerSessionToken: token } } as any, r);
  return r;
}
async function start(aadhaar = AADHAAR) {
  const r = mockRes();
  await startAadhaarDigilocker({ body: { aadhaarNumber: aadhaar } } as any, r);
  return r;
}

const xml = (lastFour: string) => `<OfflinePaperlessKyc><UidData uid="xxxxxxxx${lastFour}"><Poi name="Test Person" gender="M" dob="01-01-2000"/></UidData></OfflinePaperlessKyc>`;
/** A fake Sandbox whose session has the given status and whose Aadhaar document ends in `lastFour`. */
const sandbox = (status: string, { lastFour = "0123", docDelayMs = 0 } = {}) => ({ path }: { path: string }): Reply =>
  path === "/authenticate" ? authOk()
  : path.endsWith("/status") ? { status: 200, body: { data: { status } } }
  : path.endsWith("/documents/aadhaar") ? { status: 200, delayMs: docDelayMs, body: { data: { files: [{ url: "http://files.mock.invalid/aadhaar.xml?sig=SIGNED", metadata: { type: "xml" } }] } } }
  : path === "/aadhaar.xml" ? { status: 200, text: xml(lastFour) }
  : path.endsWith("/sessions/init") ? { status: 200, body: { data: { session_id: "sess-started", authorization_url: "https://digilocker.mock.invalid/x" } } }
  : { status: 404, body: {} };

test("pending session: two checks within 4 s -> one status call", async () => {
  useRoutes(sandbox("created"));
  const [a, b] = [await check("sess-pending"), await check("sess-pending")];
  assert.deepEqual([a.body.status, b.body.status], ["pending", "pending"]);
  assert.equal(count(/\/status/), 1);
});

test("pending is not cached: a later check asks Sandbox again", async () => {
  advance(60_000);
  useRoutes(sandbox("created"));
  await check("sess-pending");
  assert.equal(count(/\/status/), 1);
});

test("successful verification = status + documents + file download", async () => {
  advance(60_000);
  useRoutes(sandbox("succeeded"));
  const r = await check("sess-ok");
  assert.equal(r.body.status, "verified");
  assert.deepEqual([count(/\/status/), count(/documents\/aadhaar/), count(/aadhaar\.xml/)], [1, 1, 1]);
});

test("F4: re-checking a verified session makes no Sandbox calls and returns the same result", async () => {
  advance(60_000);
  useRoutes(sandbox("succeeded"));
  const first = (await check("sess-ok")).body;
  advance(5 * 60_000);
  const again = await check("sess-ok");
  assert.equal(calls.length, 0);
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.body, first);
});

test("F4: concurrent checks of a session being verified share one status + one document fetch", async () => {
  advance(60_000);
  useRoutes(sandbox("succeeded", { docDelayMs: 50 }));
  const token = createDigilockerSessionToken(AADHAAR, "sess-concurrent");
  const first = check("sess-concurrent", AADHAAR, token);
  advance(5_000); // past the 4 s throttle while the first check is still downloading
  const [a, b, c] = await Promise.all([first, check("sess-concurrent", AADHAAR, token), check("sess-concurrent", AADHAAR, token)]);
  assert.deepEqual([count(/\/status/), count(/documents\/aadhaar/), count(/aadhaar\.xml/)], [1, 1, 1]);
  for (const r of [a, b, c]) assert.equal(r.body.status, "verified");
  assert.deepEqual(b.body, a.body);
});

test("F4: the cache is scoped to session AND applicant", async () => {
  advance(60_000);
  // Another applicant presenting the same Sandbox session id is not served the cached result.
  useRoutes(sandbox("succeeded"));
  const other = await check("sess-ok", OTHER_AADHAAR);
  assert.notEqual(other.body.status, "verified");
  assert.ok(calls.length > 0, "went to Sandbox instead of the cache");
  // A token that wasn't signed by this server is rejected before the cache is consulted.
  useRoutes(sandbox("succeeded"));
  const forged = await check("sess-ok", AADHAAR, "not-a-real-token");
  assert.equal(forged.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("F4: a failure is never cached as a success (Aadhaar mismatch is re-checked)", async () => {
  advance(60_000);
  useRoutes(sandbox("succeeded", { lastFour: "9999" }));
  const a = await check("sess-mismatch");
  advance(60_000);
  const b = await check("sess-mismatch");
  assert.deepEqual([a.statusCode, b.statusCode], [400, 400]);
  assert.equal(count(/documents\/aadhaar/), 2);
});

test("F4: expired/cancelled sessions are not cached", async () => {
  advance(60_000);
  useRoutes(sandbox("expired"));
  const a = await check("sess-expired");
  advance(60_000);
  const b = await check("sess-expired");
  assert.deepEqual([a.statusCode, b.statusCode], [400, 400]);
  assert.equal(count(/\/status/), 2);
});

test("F4: the cache never outlives the session token (30 min)", async () => {
  advance(60_000);
  useRoutes(sandbox("succeeded"));
  const oldToken = createDigilockerSessionToken(AADHAAR, "sess-ttl");
  await check("sess-ttl", AADHAAR, oldToken);
  advance(31 * 60_000);
  useRoutes(sandbox("succeeded"));
  const expired = await check("sess-ttl", AADHAAR, oldToken);
  assert.equal(expired.statusCode, 400);
  assert.match(expired.body.error, /session expired/i);
  assert.equal(calls.length, 0);
  // Even with a fresh token for the same session id, the 30-min-old cache entry is gone.
  await check("sess-ttl");
  assert.equal(count(/\/status/), 1);
});

test("session start: two quick starts for one Aadhaar -> one init (second gets 429)", async () => {
  advance(60_000);
  useRoutes(sandbox("created"));
  const a = await start(), b = await start();
  assert.deepEqual([a.statusCode, b.statusCode], [200, 429]);
  assert.equal(count(/sessions\/init/), 1);
});

test("session start: two simultaneous starts -> one init", async () => {
  advance(60_000);
  useRoutes(sandbox("created"));
  const [a, b] = await Promise.all([start(), start()]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 429]);
  assert.equal(count(/sessions\/init/), 1);
});

test("rate limit: 6th start for one Aadhaar within an hour is blocked before any Sandbox call", () => {
  const run = (aadhaar: string) => {
    const r = mockRes();
    for (const mw of limits.aadhaarStart) {
      let next = false;
      mw({ ip: "10.0.0.1", body: { aadhaarNumber: aadhaar } } as any, r, () => { next = true; });
      if (!next) return { passed: false, r };
    }
    return { passed: true, r };
  };
  const results = Array.from({ length: 6 }, () => run("299999999999"));
  assert.deepEqual(results.map((x) => x.passed), [true, true, true, true, true, false]);
  assert.equal(results[5]!.r.statusCode, 429);
  assert.ok(Number(results[5]!.r.headers["Retry-After"]) > 0);
});

test("rate limit: status checks from one IP capped at 120 per 10 minutes", () => {
  let allowed = 0;
  for (let i = 0; i < 130; i++) {
    let ok = false;
    for (const mw of limits.aadhaarCheck) mw({ ip: "10.0.0.2", body: {} } as any, mockRes(), () => { ok = true; });
    if (ok) allowed++;
  }
  assert.equal(allowed, 120);
});

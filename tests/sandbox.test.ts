// Sandbox client: HTTP calls per operation, token refresh (F2), single-flight auth (F3),
// circuit breaker and logging. Each test loads a fresh copy of sandbox.ts so the token cache
// and pause state start empty.
import { calls, count, logs, useRoutes, authOk } from "./helpers/sandboxMock.ts";
import { test } from "node:test";
import assert from "node:assert/strict";

type Sandbox = typeof import("../src/config/sandbox.ts");
let n = 0;
const fresh = async (): Promise<Sandbox> => import(`../src/config/sandbox.ts?fresh=${++n}`);

const INIT_OK = { status: 200, body: { data: { session_id: "sess-1", authorization_url: "https://digilocker.mock.invalid/x" } } };
const STATUS_OK = { status: 200, body: { data: { status: "created" } } };

test("one session start = 1 init, plus 1 authenticate only when no token is cached", async () => {
  const s = await fresh();
  useRoutes(({ path }) => (path === "/authenticate" ? authOk() : INIT_OK));
  await s.initDigilockerSession();
  await s.initDigilockerSession();
  assert.equal(count(/authenticate/), 1, "token reused");
  assert.equal(count(/sessions\/init/), 2, "one init per start");
});

test("expired token: one refresh and one retry, then success", async () => {
  const s = await fresh();
  useRoutes(({ path, attempt }) => (path === "/authenticate" ? authOk(`tok-${attempt}`) : attempt === 1 ? { status: 401, body: {} } : STATUS_OK));
  assert.equal(await s.getDigilockerSessionStatus("sess-1"), "created");
  assert.deepEqual([count(/authenticate/), count(/status/)], [2, 2]);
});

test("token keeps being rejected: stops after one retry", async () => {
  const s = await fresh();
  useRoutes(({ path, attempt }) => (path === "/authenticate" ? authOk(`tok-${attempt}`) : { status: 401, body: {} }));
  await assert.rejects(s.getDigilockerSessionStatus("sess-1"));
  assert.deepEqual([count(/authenticate/), count(/status/)], [2, 2]);
});

test("F2: /authenticate itself fails -> exactly one authenticate call, no retry, no API call", async () => {
  const s = await fresh();
  useRoutes(() => ({ status: 401, body: { message: "Invalid API secret" } }));
  await assert.rejects(s.initDigilockerSession());
  assert.equal(count(/authenticate/), 1);
  assert.equal(count(/sessions\/init/), 0);
  assert.equal(calls.length, 1);
});

test("F2: token rejected, then the refresh /authenticate fails -> stops (3 calls total)", async () => {
  const s = await fresh();
  useRoutes(({ path, attempt }) => (path === "/authenticate" ? (attempt === 1 ? authOk() : { status: 401, body: { message: "Invalid API secret" } }) : { status: 401, body: {} }));
  await assert.rejects(s.getDigilockerSessionStatus("sess-1"));
  assert.deepEqual([count(/authenticate/), count(/status/)], [2, 1]);
});

test("F3: 5 concurrent requests with no cached token share ONE /authenticate", async () => {
  const s = await fresh();
  useRoutes(({ path }) => (path === "/authenticate" ? { ...authOk(), delayMs: 30 } : INIT_OK));
  await Promise.all(Array.from({ length: 5 }, () => s.initDigilockerSession()));
  assert.equal(count(/authenticate/), 1);
  assert.equal(count(/sessions\/init/), 5);
});

test("F3: concurrent requests whose token is rejected share ONE refresh", async () => {
  const s = await fresh();
  // The first token is rejected by the API; the refreshed one is accepted.
  useRoutes(({ path, attempt, headers }) =>
    path === "/authenticate" ? { ...authOk(`tok-${attempt}`), delayMs: 20 }
    : headers.Authorization === "tok-1" ? { status: 401, body: {}, delayMs: 5 } : STATUS_OK);
  await Promise.all([1, 2, 3].map((i) => s.getDigilockerSessionStatus(`sess-${i}`)));
  assert.equal(count(/authenticate/), 2, "initial fetch + one shared refresh");
  assert.equal(count(/status/), 6, "3 rejected + 3 retried");
});

test("F3: a failed shared token fetch fails every waiter once, then the next request can try again", async () => {
  const s = await fresh();
  useRoutes(({ path }) => (path === "/authenticate" ? { status: 502, body: { message: "upstream" }, delayMs: 20 } : INIT_OK));
  const results = await Promise.allSettled([1, 2, 3].map(() => s.initDigilockerSession()));
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(count(/authenticate/), 1);
  useRoutes(({ path }) => (path === "/authenticate" ? authOk() : INIT_OK));
  await s.initDigilockerSession();
  assert.equal(count(/authenticate/), 1, "in-flight state was cleared after the failure");
});

test("halted key: no retry, then the circuit breaker sends nothing", async () => {
  const s = await fresh();
  useRoutes(({ path }) => (path === "/authenticate" ? authOk() : { status: 403, body: { message: "Your API key has been halted." } }));
  await assert.rejects(s.getDigilockerSessionStatus("sess-1"), (e: any) => e.accountProblem === true);
  assert.equal(count(/status/), 1);
  const before = calls.length;
  await assert.rejects(s.initDigilockerSession());
  await assert.rejects(s.getDigilockerSessionStatus("sess-2"));
  assert.equal(calls.length, before);
});

test("quota exhausted on /authenticate trips the breaker too", async () => {
  const s = await fresh();
  useRoutes(() => ({ status: 403, body: { message: "API quota exhausted" } }));
  await assert.rejects(s.initDigilockerSession());
  const before = calls.length;
  await assert.rejects(s.initDigilockerSession());
  assert.equal(calls.length, before);
});

test("logging: one line per HTTP request with timestamp, instance, call id, attempt; no secrets", async () => {
  const s = await fresh();
  logs.length = 0;
  useRoutes(({ path, attempt }) => (path === "/authenticate" ? authOk(`tok-SECRET-${attempt}`) : attempt === 1 ? { status: 401, body: {} } : STATUS_OK));
  await s.getDigilockerSessionStatus("sess-9");
  const lines = logs.filter((l) => l.startsWith("[Sandbox] 2"));
  assert.equal(lines.length, calls.length);
  for (const l of lines) {
    assert.match(l, /^\[Sandbox\] \d{4}-\d\d-\d\dT\S+Z instance=test call=[0-9a-f]{8} attempt=(initial|retry) (GET|POST) \/\S+ -> \d{3} \(\d+ms\)$/);
  }
  assert.equal(new Set(lines.map((l) => l.match(/call=(\w+)/)![1])).size, 1, "refresh and retry share the call id");
  assert.equal(lines.filter((l) => l.includes("attempt=retry")).length, 2);
  const all = logs.join("\n");
  for (const secret of ["test-key-NOT-REAL", "test-secret-NOT-REAL", "tok-SECRET"]) assert.ok(!all.includes(secret), `leaked ${secret}`);
});

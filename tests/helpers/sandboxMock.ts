// Test harness for anything that talks to Sandbox. Import it FIRST in a test file, before any
// backend module: it sets fake credentials and replaces fetch, so the real .env key is never
// used and no request can leave the machine (anything not on a *.invalid host throws).
process.env.SANDBOX_BASE_URL = "http://sandbox.mock.invalid";
process.env.SANDBOX_API_KEY = "test-key-NOT-REAL";
process.env.SANDBOX_API_SECRET = "test-secret-NOT-REAL";
process.env.INSTANCE_NAME = "test";

export type Reply = { status: number; body?: unknown; text?: string; delayMs?: number };
export type Route = (req: { method: string; path: string; attempt: number; headers: Record<string, string> }) => Reply;

export const calls: { method: string; path: string }[] = [];
let route: Route = () => ({ status: 500, body: { message: "no route" } });
let attempts = new Map<string, number>();

/** Sets the fake Sandbox's behaviour and clears the call log. */
export function useRoutes(r: Route) {
  route = r;
  calls.length = 0;
  attempts = new Map();
}

export const count = (re: RegExp) => calls.filter((c) => re.test(`${c.method} ${c.path}`)).length;

globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
  const url = new URL(String(input));
  if (!url.hostname.endsWith(".invalid")) throw new Error(`BLOCKED real network call to ${url.host}`);
  const method = init.method || "GET";
  calls.push({ method, path: url.pathname });
  const key = `${method} ${url.pathname}`;
  const attempt = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, attempt);
  const r = route({ method, path: url.pathname, attempt, headers: (init.headers ?? {}) as Record<string, string> });
  if (r.delayMs) await new Promise((done) => setTimeout(done, r.delayMs));
  return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status: r.status, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

// Captured so tests can assert on [Sandbox] lines and that no secret is ever logged.
export const logs: string[] = [];
console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
console.error = (...a: unknown[]) => { logs.push("ERR " + a.join(" ")); };
console.warn = (...a: unknown[]) => { logs.push("WARN " + a.join(" ")); };

export const authOk = (token = "tok-SECRET-1"): Reply => ({ status: 200, body: { access_token: token } });

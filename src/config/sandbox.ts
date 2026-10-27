import type { Response } from "express";

// Sandbox (api.sandbox.co.in) client for Aadhaar verification via DigiLocker.
// Credentials are optional at startup: missing values disable Aadhaar verification only.
// The access token from /authenticate is valid for 24 hours, so it is cached in memory.

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

function getConfig() {
  const baseUrl = (process.env.SANDBOX_BASE_URL || "https://api.sandbox.co.in").replace(/\/+$/, "");
  const apiKey = process.env.SANDBOX_API_KEY;
  const apiSecret = process.env.SANDBOX_API_SECRET;
  const apiVersion = process.env.SANDBOX_API_VERSION || "1.0.0";
  if (!apiKey || !apiSecret) return null;
  return { baseUrl, apiKey, apiSecret, apiVersion };
}

export function isSandboxConfigured(): boolean {
  return getConfig() !== null;
}

/** Thrown for any non-success Sandbox response. `message` is safe to show to the user. */
export class SandboxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "SandboxError";
  }
}

// UIDAI / Sandbox messages that are too terse to show to users as-is.
function friendlyMessage(raw: string, status: number): string {
  if (/source unavailable|service unavailable|timed? ?out|gateway/i.test(raw) || status >= 500) {
    return "DigiLocker is temporarily unavailable. Please wait a few minutes and try again.";
  }
  // Our Sandbox account balance ran out: an operator problem, not something the user can fix.
  if (/insufficient (credit|balance)|credit.*(exhaust|low)|recharge/i.test(raw)) {
    return "Aadhaar verification is temporarily unavailable. Please try again later or contact the TNJA office.";
  }
  return raw;
}

async function request(path: string, init: { method: string; headers: Record<string, string>; body?: unknown }) {
  const config = getConfig();
  if (!config) throw new SandboxError("Aadhaar verification is not configured.", 503);

  let res: globalThis.Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "x-api-version": config.apiVersion, ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err: any) {
    console.error(`[Sandbox] Request to ${path} failed:`, err.message);
    throw new SandboxError("Aadhaar verification service is unreachable. Please try again.", 502);
  }

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || (json?.code && json.code >= 400)) {
    const status = res.ok ? json.code : res.status;
    const raw = json?.data?.message || json?.message || "Aadhaar verification failed.";
    console.error(`[Sandbox] ${path} returned ${status}: ${raw} (transaction_id: ${json?.transaction_id ?? "n/a"})`);
    throw new SandboxError(friendlyMessage(raw, status), status);
  }
  return json;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const config = getConfig();
  if (!config) throw new SandboxError("Aadhaar verification is not configured.", 503);

  const json = await request("/authenticate", { method: "POST", headers: { "x-api-secret": config.apiSecret } });
  const token = json?.access_token || json?.data?.access_token;
  if (!token) throw new SandboxError("Aadhaar verification service authentication failed.", 502);

  cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

/** Calls an authenticated endpoint, refreshing the access token once if it was rejected. */
async function authed(method: "GET" | "POST", path: string, body?: unknown) {
  try {
    return await request(path, { method, headers: { Authorization: await getAccessToken() }, body });
  } catch (err) {
    if (err instanceof SandboxError && (err.status === 401 || err.status === 403)) {
      return request(path, { method, headers: { Authorization: await getAccessToken(true) }, body });
    }
    throw err;
  }
}

// UIDAI discontinued Aadhaar offline e-KYC (OTP), so Aadhaar is verified through DigiLocker:
// the user signs in to DigiLocker, consents to share their Aadhaar, and we fetch it by session id.

/** Where DigiLocker sends the user after consent. Sandbox requires a public HTTPS URL. */
function digilockerRedirectUrl(): string {
  if (process.env.DIGILOCKER_REDIRECT_URL) return process.env.DIGILOCKER_REDIRECT_URL;
  const frontend = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  return `${frontend.startsWith("https://") ? frontend : "https://tnja-329-2017.in"}/digilocker-callback`;
}

/** Starts a DigiLocker consent session for the user's Aadhaar. */
export async function initDigilockerSession(): Promise<{ sessionId: string; authorizationUrl: string }> {
  const json = await authed("POST", "/kyc/digilocker/sessions/init", {
    "@entity": "in.co.sandbox.kyc.digilocker.session.request",
    flow: "signin",
    redirect_url: digilockerRedirectUrl(),
    doc_types: ["aadhaar"],
    purpose: "TNJA registration KYC",
    options: { pinless: true },
  });
  const sessionId = json?.data?.session_id;
  const authorizationUrl = json?.data?.authorization_url;
  if (!sessionId || !authorizationUrl) throw new SandboxError("Failed to start DigiLocker verification. Please try again.", 502);
  return { sessionId: String(sessionId), authorizationUrl: String(authorizationUrl) };
}

export type DigilockerSessionStatus = "created" | "succeeded" | "failed" | "expired";

export async function getDigilockerSessionStatus(sessionId: string): Promise<DigilockerSessionStatus> {
  const json = await authed("GET", `/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/status`);
  return String(json?.data?.status || "created").toLowerCase() as DigilockerSessionStatus;
}

export interface AadhaarKycDetails {
  maskedAadhaar: string | null;
  name: string | null;
  gender: string | null;
  dateOfBirth: string | null;
}

function xmlAttr(xml: string, tag: string, attr: string): string | null {
  const element = xml.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
  return element?.match(new RegExp(`\\b${attr}="([^"]*)"`))?.[1] ?? null;
}

/** Downloads the consented Aadhaar (UIDAI-signed XML) and reads the holder's basic details. */
export async function fetchDigilockerAadhaar(sessionId: string): Promise<AadhaarKycDetails> {
  let json: any;
  try {
    json = await authed("GET", `/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/documents/aadhaar`);
  } catch (err) {
    // 404 "Doctype not found": the user signed in but did not share Aadhaar on DigiLocker's consent
    // screen, or has no Aadhaar linked to their DigiLocker account.
    if (err instanceof SandboxError && err.status === 404) {
      throw new SandboxError("Your Aadhaar was not shared from DigiLocker. Click Verify again and make sure Aadhaar is selected on the consent screen.", 404);
    }
    throw err;
  }
  const files: any[] = Array.isArray(json?.data?.files) ? json.data.files : [];
  const file = files.find((f) => /xml/i.test(JSON.stringify(f?.metadata ?? ""))) || files[0];
  if (!file?.url) throw new SandboxError("Aadhaar was not found in your DigiLocker account.", 404);

  let xml: string;
  try {
    const res = await fetch(file.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err: any) {
    console.error("[Sandbox] Downloading DigiLocker Aadhaar failed:", err.message);
    throw new SandboxError("Could not read your Aadhaar from DigiLocker. Please try again.", 502);
  }

  return {
    maskedAadhaar: xmlAttr(xml, "UidData", "uid"),
    name: xmlAttr(xml, "Poi", "name"),
    gender: xmlAttr(xml, "Poi", "gender"),
    dateOfBirth: xmlAttr(xml, "Poi", "dob"),
  };
}

export function sendAadhaarNotConfigured(res: Response) {
  console.error("[Aadhaar] Sandbox credentials are not configured (SANDBOX_API_KEY / SANDBOX_API_SECRET).");
  return res.status(503).json({ error: "Aadhaar verification is not available right now. Please try again later or contact the TNJA office." });
}

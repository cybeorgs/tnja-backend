import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export const isProduction = process.env.NODE_ENV === "production";

const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  "fallback",
  "secret",
  "changeme",
  "change_me",
  "your_jwt_secret_here",
  "jwt_secret",
]);

// Production frontend plus local dev origins. Extra origins can be added via
// CORS_ORIGINS (comma-separated) without code changes.
const PRODUCTION_FRONTEND_ORIGIN = "https://tnja-329-2017.in";
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function validateJwtSecret(secret: string | undefined): string | null {
  if (!secret) return "JWT_SECRET is not set";
  if (secret.length < MIN_JWT_SECRET_LENGTH) return `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`;
  if (WEAK_JWT_SECRETS.has(secret.toLowerCase())) return "JWT_SECRET is a known placeholder value";
  return null;
}

let jwtSecret: string;
{
  const problem = validateJwtSecret(process.env.JWT_SECRET);
  if (!problem) {
    jwtSecret = process.env.JWT_SECRET as string;
  } else if (isProduction) {
    // Resolved in validateEnv(), which aborts startup before any request is served.
    jwtSecret = "";
  } else {
    // Development only: an ephemeral secret, so tokens are invalidated on restart.
    console.warn(`[Env] ${problem}; using a random per-process JWT secret (development only).`);
    jwtSecret = crypto.randomBytes(48).toString("hex");
  }
}

export function getJwtSecret(): string {
  return jwtSecret;
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>([PRODUCTION_FRONTEND_ORIGIN]);
  if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL.replace(/\/+$/, ""));
  for (const origin of (process.env.CORS_ORIGINS || "").split(",")) {
    const trimmed = origin.trim().replace(/\/+$/, "");
    if (trimmed) origins.add(trimmed);
  }
  if (!isProduction) DEV_ORIGINS.forEach((o) => origins.add(o));
  return [...origins];
}

/**
 * Validates environment configuration at startup. In production, missing or
 * invalid required variables abort the process. Secret values are never printed.
 */
export function validateEnv() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) errors.push("DATABASE_URL is not set");

  const jwtProblem = validateJwtSecret(process.env.JWT_SECRET);
  if (jwtProblem && isProduction) errors.push(jwtProblem);

  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    warnings.push("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set; super admin login is disabled");
  } else if (process.env.SUPER_ADMIN_PASSWORD.length < 12) {
    warnings.push("SUPER_ADMIN_PASSWORD is shorter than 12 characters; use a stronger password");
  }

  const smtpMissing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
  if (smtpMissing.length) warnings.push(`SMTP not configured (missing ${smtpMissing.join(", ")}); emails will fail`);

  const razorpayMissing = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].filter((k) => !process.env[k]);
  if (razorpayMissing.length) warnings.push(`Razorpay not configured (missing ${razorpayMissing.join(", ")}); payments will fail`);

  if (!process.env.FRONTEND_URL) warnings.push("FRONTEND_URL is not set; password reset links may be wrong");

  warnings.forEach((w) => console.warn(`[Env] Warning: ${w}`));

  if (errors.length) {
    errors.forEach((e) => console.error(`[Env] Error: ${e}`));
    if (isProduction) {
      console.error("[Env] Refusing to start in production with invalid configuration.");
      process.exit(1);
    }
  }
}

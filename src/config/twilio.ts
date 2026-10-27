// Twilio Verify for mobile number OTPs: Twilio generates the code, sends the SMS (it
// handles India's DLT registration) and checks the code. Credentials are optional at
// startup: missing values disable mobile verification only.

const VERIFY_URL = "https://verify.twilio.com/v2";
const REQUEST_TIMEOUT_MS = 20_000;

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

export function isTwilioConfigured(): boolean {
  return getConfig() !== null;
}

/** Twilio's error, e.g. { code: 60202, message: "Max check attempts reached" }. */
export class TwilioVerifyError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, message: string) {
    super(message);
  }
}

async function verifyRequest(path: string, params: Record<string, string>) {
  const config = getConfig();
  if (!config) throw new Error("[Twilio] not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID)");

  const res = await fetch(`${VERIFY_URL}/Services/${config.serviceSid}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new TwilioVerifyError(res.status, json?.code, `[Twilio] ${res.status} ${json?.code ?? ""}: ${json?.message ?? "request failed"}`);
  return json;
}

/** Sends a verification code by SMS to a 10-digit Indian mobile number. */
export async function startMobileVerification(mobileNumber: string): Promise<void> {
  await verifyRequest("Verifications", { To: `+91${mobileNumber}`, Channel: "sms" });
}

/**
 * Checks the code the person entered. Returns null when it is correct, otherwise a
 * message for them. Twilio expires codes after 10 minutes and allows 5 checks.
 */
export async function checkMobileVerification(mobileNumber: string, code: string): Promise<string | null> {
  try {
    const result = await verifyRequest("VerificationCheck", { To: `+91${mobileNumber}`, Code: code });
    return result?.status === "approved" ? null : "Incorrect OTP. Please check and try again.";
  } catch (error) {
    // 404 (20404): no pending verification — it expired, was already used, or was never sent.
    if (error instanceof TwilioVerifyError && error.status === 404) return "OTP has expired. Please click Resend OTP.";
    // 60202: too many wrong codes for this verification.
    if (error instanceof TwilioVerifyError && error.code === 60202) return "Too many incorrect attempts. Please click Resend OTP.";
    throw error;
  }
}

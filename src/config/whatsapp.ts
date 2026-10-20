// MSG91 WhatsApp client for sending OTPs with an approved AUTHENTICATION template
// (body {{1}} = code, plus a copy-code button that also carries the code).
// Credentials are optional at startup: missing values disable mobile verification only.

const SEND_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const REQUEST_TIMEOUT_MS = 20_000;

function getConfig() {
  const authKey = process.env.WHATSAPP_AUTHKEY;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const senderNumber = process.env.WHATSAPP_SENDER_NUMBER;
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
  if (!authKey || !templateName || !senderNumber) return null;
  return { authKey, templateName, senderNumber, language };
}

export function isWhatsappConfigured(): boolean {
  return getConfig() !== null;
}

/** Sends the OTP to a 10-digit Indian mobile number on WhatsApp. Throws if MSG91 rejects it. */
export async function sendWhatsappOtp(mobileNumber: string, otp: string): Promise<void> {
  const config = getConfig();
  if (!config) throw new Error("[WhatsApp] MSG91 is not configured (WHATSAPP_AUTHKEY / WHATSAPP_TEMPLATE_NAME / WHATSAPP_SENDER_NUMBER)");

  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: config.authKey },
    body: JSON.stringify({
      integrated_number: config.senderNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: config.templateName,
          language: { code: config.language, policy: "deterministic" },
          namespace: null,
          to_and_components: [
            {
              to: [`91${mobileNumber}`],
              components: {
                body_1: { type: "text", value: otp },
                button_1: { subtype: "url", type: "text", value: otp },
              },
            },
          ],
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.hasError || (json?.status && json.status !== "success")) {
    throw new Error(`[WhatsApp] MSG91 returned ${res.status}: ${JSON.stringify(json?.errors ?? json?.message ?? json)}`);
  }
}

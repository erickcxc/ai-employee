// Signed call tokens: the session route issues one per call and the tool route requires it, so tools
// only run for a real, recent call (SOC 2 CC6.1). HMAC-SHA256, compared in constant time.
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 30 * 60_000;

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

function check(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}

export function signCallToken(callId: string, secret: string | undefined, now = Date.now()): string {
  const body = `${callId}.${now + MAX_AGE_MS}`;
  return `${body}.${mac(body, check(secret))}`;
}

/** The call id, or null when the token is expired, altered or signed with another secret. */
export function verifyCallToken(token: string, secret: string | undefined, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [callId, exp, sig] = parts;
  const want = Buffer.from(mac(`${callId}.${exp}`, check(secret)));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(exp) > now ? callId : null;
}

// Field-level encryption for customer contact details (SOC 2 C1.1, CC6.1): phone, email and address
// are stored as AES-256-GCM ciphertext, so a database dump alone reveals none of them. Lookups by
// phone use a keyed hash of the digits, never the number itself.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { Env } from "@/providers";

// PUBLIC ON PURPOSE, LOCAL FAKE MODE ONLY: not a credential. It lets the sample run with no setup on
// made-up data. Live mode (PROVIDERS=live) refuses to start without your own FIELD_KEY.
const PUBLIC_DEV_ONLY_KEY = Buffer.from("PUBLIC-dev-only-key-not-secret!!");

export function fieldKey(env: Env = process.env): Buffer {
  if (!env.FIELD_KEY) {
    if ((env.PROVIDERS ?? "fake") === "fake") return PUBLIC_DEV_ONLY_KEY;
    throw new Error("FIELD_KEY is required when PROVIDERS=live");
  }
  const key = Buffer.from(env.FIELD_KEY, "base64");
  if (key.length !== 32) throw new Error("FIELD_KEY must be 32 bytes, base64");
  return key;
}

const b64 = (b: Buffer) => b.toString("base64");

export function encryptField(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

export function decryptField(stored: string, key: Buffer): string {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("not an encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** Keyed hash of a phone number's digits (US numbers normalized to 11 digits). */
export function lookupHash(phone: string, key: Buffer): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return createHmac("sha256", key).update(`phone:${digits}`).digest("hex");
}

/** Keyed hash of an email, for sign-in lookups. */
export function emailHash(email: string, key: Buffer): string {
  return createHmac("sha256", key).update(`email:${email.trim().toLowerCase()}`).digest("hex");
}

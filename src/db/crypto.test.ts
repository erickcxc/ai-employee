import { describe, expect, test } from "bun:test";
import { decryptField, encryptField, fieldKey, lookupHash } from "./crypto";

const key = fieldKey({ FIELD_KEY: Buffer.alloc(32, 7).toString("base64"), PROVIDERS: "live" });

describe("field encryption", () => {
  test("round-trips, and the stored form never contains the plain value", () => {
    const stored = encryptField("+1 555 010 0142", key);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("555");
    expect(decryptField(stored, key)).toBe("+1 555 010 0142");
  });

  test("the same value encrypts differently each time", () => {
    expect(encryptField("2207 Linden Court", key)).not.toBe(encryptField("2207 Linden Court", key));
  });

  test("a tampered value fails instead of decrypting to garbage", () => {
    const stored = encryptField("2207 Linden Court", key);
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptField(parts.join("."), key)).toThrow();
  });

  test("the wrong key fails", () => {
    const other = fieldKey({ FIELD_KEY: Buffer.alloc(32, 9).toString("base64"), PROVIDERS: "live" });
    expect(() => decryptField(encryptField("x", key), other)).toThrow();
  });

  test("phone lookups match however the number is written, without storing it", () => {
    expect(lookupHash("+1 (555) 010-0142", key)).toBe(lookupHash("15550100142", key));
    expect(lookupHash("+1 (555) 010-0142", key)).not.toContain("555");
  });

  test("live mode requires a 32-byte key; local fake mode uses a fixed dev key", () => {
    expect(() => fieldKey({ PROVIDERS: "live" })).toThrow("FIELD_KEY");
    expect(() => fieldKey({ PROVIDERS: "live", FIELD_KEY: "c2hvcnQ=" })).toThrow("32 bytes");
    expect(fieldKey({ PROVIDERS: "fake" }).length).toBe(32);
  });
});

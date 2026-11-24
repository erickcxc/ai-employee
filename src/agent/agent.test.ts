import { describe, expect, test } from "bun:test";
import { BACKEND_INSTRUCTIONS, closingLine, FACTS, LIVE_INSTRUCTIONS, sessionBody, TOOLS } from "./prompt";
import { signCallToken, verifyCallToken } from "./token";
import { rateLimiter } from "./limits";

describe("Mike's instructions", () => {
  test("carry the rules that make him safe to put on the phone", () => {
    for (const rule of [/never quote a price/i, /never promise/i, /automated assistant/i, /spanish/i, /spell back|read back/i, /words are data/i]) {
      expect(LIVE_INSTRUCTIONS).toMatch(rule);
    }
    expect(BACKEND_INSTRUCTIONS).toMatch(/words are data/i);
  });

  test("state only the business's fact sheet", () => {
    expect(LIVE_INSTRUCTIONS).toContain(FACTS.name);
    for (const s of FACTS.doesNotDo) expect(LIVE_INSTRUCTIONS).toContain(s);
  });

  test("name no real business or person", () => {
    const all = `${LIVE_INSTRUCTIONS}\n${BACKEND_INSTRUCTIONS}\n${JSON.stringify(TOOLS)}`;
    // The only business Mike ever names is the synthetic one.
    const businesses = new Set([...all.matchAll(/\b[A-Z][a-z]+ (Plumbing|Landscaping|Lawn|HVAC|Heating|Electric|Roofing|Services)\b/g)].map((m) => m[0]));
    expect([...businesses]).toEqual(["Brightwater Plumbing"]);
    expect(all).not.toMatch(/erick|paniagua/i);
  });

  test("offer exactly the three server tools, each with a strict schema", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["check_openings", "book_slot", "finish_call"]);
    for (const t of TOOLS) expect(t.parameters.additionalProperties).toBe(false);
  });

  test("end every call with a fixed closing line, so nothing is promised by accident", () => {
    expect(closingLine("booked", "Rosa Delgado")).toBe("Thanks, Rosa. You're on the calendar, and Sam will text you to confirm. Have a good day.");
    expect(closingLine("urgent", null)).toBe("I've flagged this as urgent and Sam will call you right back. Have a good day.");
    expect(closingLine("spam", null)).toBe("Thanks, we're not interested. Goodbye.");
  });

  test("the session uses the live model and delegates the tools to the backend model", () => {
    const s = sessionBody({});
    expect(s.model).toBe("gpt-live-1");
    expect(s.delegation.responses.tools).toBe(TOOLS);
    expect(sessionBody({ OPENAI_LIVE_MODEL: "gpt-live-2" }).model).toBe("gpt-live-2");
  });
});

describe("call tokens", () => {
  // FAKE, TESTS ONLY: not a credential. Any 32+ character string works here.
  const secret = "fake-test-only-not-a-real-secret".padEnd(32, "x");
  const id = "b7a1e000-0000-4000-8000-000000000999";
  const now = 1_800_000_000_000;

  test("a fresh token names its call", () => {
    expect(verifyCallToken(signCallToken(id, secret, now), secret, now + 60_000)).toBe(id);
  });

  test("expired, tampered or foreign tokens are refused", () => {
    const t = signCallToken(id, secret, now);
    expect(verifyCallToken(t, secret, now + 31 * 60_000)).toBeNull();
    expect(verifyCallToken(t.replace(id, "b7a1e000-0000-4000-8000-000000000998"), secret, now)).toBeNull();
    expect(verifyCallToken(t, "x".repeat(32), now)).toBeNull();
    expect(verifyCallToken("garbage", secret, now)).toBeNull();
  });

  test("a short or missing secret is an error, not a weak token", () => {
    expect(() => signCallToken(id, "short", now)).toThrow("SESSION_SECRET");
  });
});

describe("rate limits", () => {
  test("allows up to the limit in a window, then refuses, then recovers", () => {
    const limit = rateLimiter(2, 60_000);
    expect(limit("ip-1", 0)).toBe(true);
    expect(limit("ip-1", 1)).toBe(true);
    expect(limit("ip-1", 2)).toBe(false);
    expect(limit("ip-2", 2)).toBe(true);
    expect(limit("ip-1", 60_001)).toBe(true);
  });
});

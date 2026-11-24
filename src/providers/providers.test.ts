import { describe, expect, test } from "bun:test";
import { providers } from "./index";

describe("providers", () => {
  test("fake mode needs no keys and records every send instead of sending it", async () => {
    const p = providers({ PROVIDERS: "fake" });
    await p.sms.send({ to: "+15550100001", body: "Running ten minutes late." });
    await p.email.send({ to: "owner@brightwater.example", subject: "Briefing", text: "Three jobs today." });
    expect(p.sms.sent).toEqual([{ to: "+15550100001", body: "Running ten minutes late." }]);
    expect(p.email.sent).toHaveLength(1);
  });

  test("the voice model is started on the server: the browser sends an offer and gets an answer, never a key", async () => {
    const p = providers({ PROVIDERS: "fake" });
    const answer = await p.voice.startCall({ sdp: "v=0 offer", session: { model: "m" } });
    expect(answer.sdp.startsWith("v=")).toBe(true);
    expect(p.voice.started).toHaveLength(1);
  });

  test("fake model answers come from a script, so tests are repeatable", async () => {
    const p = providers({ PROVIDERS: "fake" }, { llm: [{ verdict: "pass", reasons: [] }] });
    expect(await p.llm.json({ system: "s", user: "u" })).toEqual({ verdict: "pass", reasons: [] });
    await expect(p.llm.json({ system: "s", user: "u" })).rejects.toThrow("no scripted answer");
  });

  test("live mode fails closed when a key is missing, naming the variable, never a value", () => {
    expect(() => providers({ PROVIDERS: "live" })).toThrow("OPENAI_API_KEY");
  });

  test("live SMS stays off unless explicitly enabled, so nothing reaches a real phone by accident", () => {
    const p = providers({ PROVIDERS: "live", OPENAI_API_KEY: "test" });
    expect(p.sms.kind).toBe("fake");
  });

  test("every model request tells the provider not to store it (business data stays out of retention and training)", async () => {
    const bodies: Record<string, unknown>[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), { status: 200 });
    }) as typeof fetch;
    try {
      await providers({ PROVIDERS: "live", OPENAI_API_KEY: "fake-test-only-not-a-real-secret" }).llm.json({ system: "s", user: "u" });
    } finally {
      globalThis.fetch = real;
    }
    expect(bodies[0].store).toBe(false);
  });

  test("an unknown mode is an error, not a silent default", () => {
    expect(() => providers({ PROVIDERS: "prod" })).toThrow("PROVIDERS");
  });
});

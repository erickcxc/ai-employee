import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { openDb, type Db } from "@/db";
import { BRIGHTWATER, seed } from "@/db/seed";
import { providers } from "@/providers";
import { rateLimiter } from "./limits";
import { handleDailyJobs, handleSession, handleTool, handleTranscript, type RouteContext } from "./routes";

let db: Db;
let ctx: RouteContext;
const finished: string[] = [];
const transcribed: string[] = [];
const NOW = new Date("2026-11-16T14:30:00Z");
// FAKE, TESTS ONLY: not a credential. Any 32+ character string works here.
const SECRET = "fake-test-only-not-a-real-secret".padEnd(40, "x");
const post = (body: unknown, ip = "203.0.113.7") =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  const key = fieldKey({ PROVIDERS: "fake" });
  await seed(db, { now: NOW, key });
  ctx = {
    deps: { db, key, businessId: BRIGHTWATER, now: () => NOW },
    providers: providers({ PROVIDERS: "fake" }),
    env: { SESSION_SECRET: SECRET },
    limitCalls: rateLimiter(3, 3_600_000),
    afterFinish: (id) => finished.push(id),
    afterTranscript: (id) => transcribed.push(id),
  };
});
afterAll(() => db.close());

const OFFER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n";

describe("POST /api/call/session", () => {
  test("starts a call: the voice model gets Mike's session, the browser gets an answer, a call id and a token", async () => {
    const res = await handleSession(post({ sdp: OFFER }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sdp.startsWith("v=")).toBe(true);
    expect(body.callId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof body.token).toBe("string");
    expect(body.greeting).toBe("Thanks for calling Brightwater Plumbing, this is Mike. How can I help?");
    const sent = ctx.providers.voice.started.at(-1)!.session as { delegation: { responses: { tools: { name: string }[] } } };
    expect(sent.delegation.responses.tools.map((t) => t.name)).toContain("book_slot");
    expect(JSON.stringify(body)).not.toContain("OPENAI");
  });

  test("refuses a malformed offer", async () => {
    expect((await handleSession(post({ sdp: "hello" }), ctx)).status).toBe(400);
  });

  test("limits calls per visitor", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 3; i++) expect((await handleSession(post({ sdp: OFFER }, ip), ctx)).status).toBe(200);
    expect((await handleSession(post({ sdp: OFFER }, ip), ctx)).status).toBe(429);
  });

  test("is unavailable, not insecure, without a session secret", async () => {
    expect((await handleSession(post({ sdp: OFFER }, "192.0.2.1"), { ...ctx, env: {} })).status).toBe(503);
  });
});

describe("POST /api/call/tool", () => {
  const start = async () => (await (await handleSession(post({ sdp: OFFER }, `192.0.2.${Math.floor(Math.random() * 200)}`), ctx)).json()) as { callId: string; token: string };

  test("runs a tool for the call the token was issued to", async () => {
    const { token } = await start();
    const res = await handleTool(post({ token, name: "check_openings", args: {} }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.openings.length).toBeGreaterThan(0);
    expect(body.events[0].type).toBe("tool_call");
  });

  test("tool calls per call are limited on the server", async () => {
    const { token } = await start();
    const codes: number[] = [];
    for (let i = 0; i < 45; i++) codes.push((await handleTool(post({ token, name: "check_openings", args: {} }), ctx)).status);
    expect(codes.slice(0, 40).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  test("finish_call comes back with the exact closing line to say", async () => {
    const { token } = await start();
    const res = await handleTool(post({ token, name: "finish_call", args: { verdict: "message", urgent: false, name: "Linda Reyes", phone: "+12175550103", address: null, summary: "Invoice question." } }), ctx);
    expect((await res.json()).output.say).toBe("I'll pass that to Sam. Have a good day.");
  });

  test("refuses a missing or forged token", async () => {
    expect((await handleTool(post({ name: "check_openings", args: {} }), ctx)).status).toBe(401);
    const { token } = await start();
    const forged = token.replace(/\.[^.]+$/, ".AAAA");
    expect((await handleTool(post({ token: forged, name: "check_openings", args: {} }), ctx)).status).toBe(401);
  });
});

describe("after the call", () => {
  const start = async () => (await (await handleSession(post({ sdp: OFFER }, `192.0.2.${100 + Math.floor(Math.random() * 100)}`), ctx)).json()) as { callId: string; token: string };

  test("finishing a call schedules the follow-up; other tools do not", async () => {
    const { callId, token } = await start();
    await handleTool(post({ token, name: "check_openings", args: {} }), ctx);
    expect(finished).not.toContain(callId);
    await handleTool(post({ token, name: "finish_call", args: { verdict: "message", urgent: false, name: "Linda Reyes", phone: "+12175550103", address: null, summary: "Invoice question." } }), ctx);
    expect(finished).toContain(callId);
  });

  test("the transcript is saved to the call, capped, and grading is scheduled", async () => {
    const { callId, token } = await start();
    const lines = Array.from({ length: 250 }, (_, i) => ({ who: i % 2 ? "mike" : "caller", text: "x".repeat(3000) }));
    expect((await handleTranscript(post({ token, lines }), ctx)).status).toBe(200);
    const [c] = await db.admin.query<{ transcript: { text: string }[] }>(`select transcript from calls where id = $1`, [callId]);
    expect(c.transcript).toHaveLength(200);
    expect(c.transcript[0].text.length).toBe(2000);
    expect(transcribed).toContain(callId);
  });

  test("a transcript is accepted once per call, so it cannot be overwritten or graded again", async () => {
    const { callId, token } = await start();
    const lines = [{ who: "caller", text: "Hi." }];
    expect((await handleTranscript(post({ token, lines }), ctx)).status).toBe(200);
    const graded = transcribed.filter((id) => id === callId).length;
    expect((await handleTranscript(post({ token, lines: [{ who: "caller", text: "Changed." }] }), ctx)).status).toBe(409);
    expect(transcribed.filter((id) => id === callId).length).toBe(graded);
    const [c] = await db.admin.query<{ transcript: { text: string }[] }>(`select transcript from calls where id = $1`, [callId]);
    expect(c.transcript[0].text).toBe("Hi.");
  });

  test("a transcript is refused after the call's time is over", async () => {
    const { callId, token } = await start();
    await db.admin.query(`update calls set started_at = $1 where id = $2`, [new Date(NOW.getTime() - 20 * 60_000), callId]);
    expect((await handleTranscript(post({ token, lines: [{ who: "caller", text: "Hi." }] }), ctx)).status).toBe(409);
  });

  test("a transcript needs the call's token and well-formed lines", async () => {
    expect((await handleTranscript(post({ lines: [] }), ctx)).status).toBe(401);
    const { token } = await start();
    expect((await handleTranscript(post({ token, lines: [{ who: "admin", text: "hi" }] }), ctx)).status).toBe(400);
  });
});

describe("GET /api/jobs/daily", () => {
  const get = (auth?: string) => new Request("http://localhost/api/jobs/daily", { headers: auth ? { authorization: auth } : {} });
  // FAKE, TESTS ONLY: not a credential.
  const CRON = "fake-test-only-cron-value".padEnd(32, "x");
  const jobs = () => ({ ...ctx, env: { ...ctx.env, CRON_SECRET: CRON } });

  test("runs the briefing and retention for the scheduler", async () => {
    const res = await handleDailyJobs(get(`Bearer ${CRON}`), jobs());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, briefing: { created: true }, retention: { transcriptsCleared: 0 } });
  });

  test("refuses anyone else, and is off when no scheduler key is set", async () => {
    expect((await handleDailyJobs(get("Bearer wrong"), jobs())).status).toBe(401);
    expect((await handleDailyJobs(get(), jobs())).status).toBe(401);
    expect((await handleDailyJobs(get(`Bearer ${CRON}`), ctx)).status).toBe(503);
  });
});

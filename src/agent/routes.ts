// The two endpoints behind a browser call, as plain functions so they are tested without a server.
// Session: takes the browser's WebRTC offer, opens a call record, starts the voice model with the
// server's key and returns the answer plus a signed call token. Tool: runs one tool for the call the
// token names. The API key never reaches the browser; the token is the only thing it holds.
import { timingSafeEqual } from "node:crypto";
import type { Env, Providers } from "@/providers";
import { buildBriefing, runRetention } from "@/jobs";
import { auditHead } from "@/db";
import { closingLine, GREETING, sessionBody, type Closing } from "./prompt";
import { signCallToken, verifyCallToken } from "./token";
import { runTool, startCall, type ToolDeps } from "./tools";
import { MAX_CALL_MS, rateLimiter } from "./limits";

export type RouteContext = {
  deps: ToolDeps;
  providers: Providers;
  env: Env;
  limitCalls: (key: string) => boolean;
  /** Tool calls per call. Defaults to 40 in 15 minutes. */
  limitTools?: (key: string) => boolean;
  /** Runs after the response (the follow-up draft), so the caller never waits on it. */
  afterFinish?: (callId: string) => void;
  /** Runs after the transcript is saved (grading). */
  afterTranscript?: (callId: string) => void;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleSession(req: Request, ctx: RouteContext): Promise<Response> {
  const secret = ctx.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return json({ ok: false, message: "Mike is unavailable right now." }, 503);
  if (!ctx.limitCalls(`call:${clientIp(req)}`)) return json({ ok: false, message: "Call limit reached. Please try again later." }, 429);

  const body = await readJson(req);
  const sdp = body?.sdp;
  if (typeof sdp !== "string" || !sdp.startsWith("v=") || sdp.length > 20_000) return json({ ok: false, message: "Invalid offer" }, 400);

  const callId = await startCall(ctx.deps);
  try {
    const answer = await ctx.providers.voice.startCall({ sdp, session: sessionBody(ctx.env) });
    return json({ ok: true, sdp: answer.sdp, callId, token: signCallToken(callId, secret), greeting: GREETING });
  } catch (e) {
    console.error("voice session failed:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, message: "Could not start the call. Please try again." }, 502);
  }
}

export async function handleTool(req: Request, ctx: RouteContext): Promise<Response> {
  const body = await readJson(req);
  const token = body?.token;
  const callId = typeof token === "string" ? verifyCallToken(token, ctx.env.SESSION_SECRET) : null;
  if (!callId) return json({ ok: false, message: "Unauthorized" }, 401);
  if (!(ctx.limitTools ?? toolLimit)(`tools:${callId}`)) return json({ ok: false, message: "Too many tool calls" }, 429);
  const name = typeof body?.name === "string" ? body.name : "";

  const result = await runTool(ctx.deps, callId, name, body?.args ?? {});
  if (name === "finish_call" && result.output.recorded) {
    const args = (body?.args ?? {}) as { name?: string | null };
    result.output.say = closingLine(result.output.closing as Closing, args.name ?? null);
    ctx.afterFinish?.(callId);
  }
  return json({ ok: true, ...result });
}

const toolLimit = rateLimiter(40, 15 * 60_000);
// A transcript arrives at hang-up: within the call cap plus its grace, with a few minutes to spare.
const TRANSCRIPT_WINDOW_MS = MAX_CALL_MS + 5 * 60_000;
const MAX_LINES = 200;
const MAX_LINE = 2000;

/** The browser sends the call's transcript at hang-up; it is stored on the call, then graded. */
export async function handleTranscript(req: Request, ctx: RouteContext): Promise<Response> {
  const body = await readJson(req);
  const token = body?.token;
  const callId = typeof token === "string" ? verifyCallToken(token, ctx.env.SESSION_SECRET) : null;
  if (!callId) return json({ ok: false, message: "Unauthorized" }, 401);
  const lines = body?.lines;
  if (!Array.isArray(lines) || !lines.every((l) => l && (l.who === "caller" || l.who === "mike") && typeof l.text === "string")) {
    return json({ ok: false, message: "Invalid transcript" }, 400);
  }
  const clean = (lines as { who: string; text: string }[]).slice(0, MAX_LINES).map((l) => ({ who: l.who, text: l.text.slice(0, MAX_LINE) }));
  // Accepted once, and only while the call is fresh: it cannot be overwritten or graded again.
  const saved = await ctx.deps.db.as({ role: "agent", id: "mike", businessId: ctx.deps.businessId }, (tx) =>
    tx.query(`update calls set transcript = $1 where id = $2 and transcript is null and started_at > $3 returning id`, [
      JSON.stringify(clean), callId, new Date(ctx.deps.now().getTime() - TRANSCRIPT_WINDOW_MS),
    ]),
  );
  if (!saved.length) return json({ ok: false, message: "Transcript already saved or call is over" }, 409);
  ctx.afterTranscript?.(callId);
  return json({ ok: true });
}

/** The scheduler's daily run: the morning briefing and data retention. Needs CRON_SECRET as a bearer. */
export async function handleDailyJobs(req: Request, ctx: RouteContext): Promise<Response> {
  const want = ctx.env.CRON_SECRET;
  if (!want || want.length < 32) return json({ ok: false, message: "Scheduler not configured" }, 503);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${want}`);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return json({ ok: false, message: "Unauthorized" }, 401);
  const job = { db: ctx.deps.db, key: ctx.deps.key, businessId: ctx.deps.businessId, providers: ctx.providers, now: ctx.deps.now };
  const briefing = await buildBriefing(job);
  const retention = await runRetention(ctx.deps.db, ctx.deps.now());
  // Logged to the host, outside the database: the anchor a later audit check is verified against.
  const auditHeadNow = await auditHead(ctx.deps.db);
  console.log(`audit head: ${JSON.stringify(auditHeadNow)}`);
  return json({ ok: true, briefing, retention, auditHead: auditHeadNow });
}

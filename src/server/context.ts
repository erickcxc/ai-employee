// One server context per process: the database, the providers, sign-in, approvals and the limits.
// Local: an in-process Postgres in .data/pg, seeded with Brightwater on first run. Production:
// DATABASE_URL, migrated ahead of time by the admin role.
import "server-only";
import { after } from "next/server";
import { afterCall, gradeCall } from "@/jobs";
import { openDb } from "@/db";
import { fieldKey } from "@/db/crypto";
import { BRIGHTWATER, seed } from "@/db/seed";
import { providers } from "@/providers";
import { rateLimiter } from "@/agent/limits";
import { runMode } from "./mode";
import type { RouteContext } from "@/agent/routes";
import type { AuthCtx } from "@/auth";
import type { ApprovalCtx } from "@/review/approvals";

export type AppContext = RouteContext & { auth: AuthCtx; approvals: ApprovalCtx; limitLogins: (key: string) => boolean; local: boolean };

let ready: Promise<AppContext> | null = null;

async function build(): Promise<AppContext> {
  const env = process.env;
  const { local } = runMode(env);
  const key = fieldKey(env);
  const db = await openDb({ url: env.DATABASE_URL || undefined, dataDir: ".data/pg" });
  if (!env.DATABASE_URL) {
    await db.migrate();
    const seeded = await db.admin.query(`select id from businesses where id = $1`, [BRIGHTWATER]);
    if (!seeded.length) await seed(db, { key });
  }
  const p = providers(env);
  const businessId = env.BUSINESS_ID || BRIGHTWATER;
  const now = () => new Date();
  const job = { db, key, businessId, providers: p, now };
  // Follow-ups and grading run after the response is sent, so the call never waits on them.
  const later = (name: string, task: () => Promise<unknown>) =>
    after(() => task().catch((e) => console.error(`${name} failed:`, e instanceof Error ? e.message : "unknown")));
  return {
    deps: { db, key, businessId, now },
    providers: p,
    env,
    limitCalls: rateLimiter(4, 60 * 60_000),
    limitTools: rateLimiter(40, 15 * 60_000),
    afterFinish: (id) => later("follow-up", () => afterCall(job, id)),
    afterTranscript: (id) => later("grading", () => gradeCall(job, id)),
    limitLogins: rateLimiter(5, 15 * 60_000),
    auth: { db, key, secret: env.SESSION_SECRET, baseUrl: env.APP_URL || "http://localhost:3000", providers: p, now },
    approvals: { db, key, businessId, providers: p },
    local,
  };
}

export const context = () => (ready ??= build());

// Sign-in for the team app (SOC 2 CC6.1, CC6.2). A person asks for a link by email; the link is single
// use, expires in 15 minutes and only its hash is stored. Using it opens a server-side session (12
// hours) held in a signed cookie; signing out revokes it on the server. Unknown emails get the same
// answer as known ones, so the form cannot be used to find accounts.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor, Db } from "@/db";
import { emailHash } from "@/db/crypto";
import type { Providers } from "@/providers";

export type AuthCtx = { db: Db; key: Buffer; secret: string | undefined; baseUrl: string; providers: Providers; now: () => Date };

export const COOKIE = "ae_session";
export const SESSION_MS = 12 * 3_600_000;
const LINK_MS = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
function secretOf(ctx: AuthCtx) {
  if (!ctx.secret || ctx.secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return ctx.secret;
}
const sign = (ctx: AuthCtx, v: string) => createHmac("sha256", secretOf(ctx)).update(`session:${v}`).digest("base64url");

export async function requestLogin(ctx: AuthCtx, email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) return;
  const token = randomBytes(32).toString("base64url");
  const found = await ctx.db.asAuth(async (tx) => {
    const [p] = await tx.query<{ id: string }>(`select id from people where email_hash = $1`, [emailHash(clean, ctx.key)]);
    if (!p) return false;
    await tx.query(`insert into login_tokens (token_hash, person_id, expires_at) values ($1, $2, $3)`, [sha256(token), p.id, new Date(ctx.now().getTime() + LINK_MS)]);
    return true;
  });
  if (!found) return;
  // A page with a button, not a GET that signs in: mail scanners open links and would burn them.
  const link = `${ctx.baseUrl}/login/verify?token=${token}`;
  await ctx.providers.email.send({
    to: clean,
    subject: "Your sign-in link",
    text: `Sign in to the team app: ${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  });
}

/** Uses a link. Returns the session cookie value, or null if the link is unknown, used or expired. */
export async function verifyLogin(ctx: AuthCtx, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const now = ctx.now();
  const sessionId = await ctx.db.asAuth(async (tx) => {
    const [t] = await tx.query<{ person_id: string }>(
      `update login_tokens set used_at = $2 where token_hash = $1 and used_at is null and expires_at > $2 returning person_id`,
      [sha256(token), now],
    );
    if (!t) return null;
    const [p] = await tx.query<{ business_id: string }>(`select business_id from people where id = $1`, [t.person_id]);
    await tx.query(`select set_config('app.actor', $1, true)`, [`person:${t.person_id}`]);
    const [s] = await tx.query<{ id: string }>(
      `insert into sessions (business_id, person_id, created_at, expires_at) values ($1, $2, $3, $4) returning id`,
      [p.business_id, t.person_id, now, new Date(now.getTime() + SESSION_MS)],
    );
    return s.id;
  });
  return sessionId ? `${sessionId}.${sign(ctx, sessionId)}` : null;
}

function sessionIdFrom(ctx: AuthCtx, cookie: string): string | null {
  const [id, sig] = cookie.split(".");
  if (!id || !sig || !UUID.test(id)) return null;
  const want = Buffer.from(sign(ctx, id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export async function actorFromCookie(ctx: AuthCtx, cookie: string | undefined): Promise<Actor | null> {
  const id = cookie ? sessionIdFrom(ctx, cookie) : null;
  if (!id) return null;
  const [row] = await ctx.db.asAuth((tx) =>
    tx.query<{ person_id: string; business_id: string; role: "owner" | "team" }>(
      `select s.person_id, s.business_id, p.role from sessions s join people p on p.id = s.person_id
       where s.id = $1 and s.revoked_at is null and s.expires_at > $2`,
      [id, ctx.now()],
    ),
  );
  return row ? { role: row.role, id: row.person_id, businessId: row.business_id } : null;
}

export async function signOut(ctx: AuthCtx, cookie: string | undefined): Promise<void> {
  const id = cookie ? sessionIdFrom(ctx, cookie) : null;
  if (!id) return;
  await ctx.db.asAuth((tx) => tx.query(`update sessions set revoked_at = $2 where id = $1 and revoked_at is null`, [id, ctx.now()]));
}

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { openDb, type Db } from "@/db";
import { BRIGHTWATER, SEED, seed } from "@/db/seed";
import { providers } from "@/providers";
import { actorFromCookie, requestLogin, signOut, verifyLogin, type AuthCtx } from "./index";

let db: Db;
let ctx: AuthCtx;
let clock = new Date("2026-11-16T14:30:00Z");
const linkIn = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  const key = fieldKey({ PROVIDERS: "fake" });
  await seed(db, { now: clock, key });
  ctx = { db, key, secret: "fake-test-only-not-a-real-secret".padEnd(40, "x") /* FAKE, TESTS ONLY */, baseUrl: "http://localhost:3000", providers: providers({ PROVIDERS: "fake" }), now: () => clock };
});
afterAll(() => db.close());

describe("sign-in links", () => {
  test("a known email gets a one-time link; the link signs the owner in as owner of their business", async () => {
    await requestLogin(ctx, "Sam@Brightwater.example ");
    const mail = ctx.providers.email.sent.at(-1)!;
    expect(mail.to).toBe("sam@brightwater.example");
    const cookie = await verifyLogin(ctx, linkIn(mail.text));
    expect(cookie).not.toBeNull();
    expect(await actorFromCookie(ctx, cookie!)).toEqual({ role: "owner", id: SEED.owner.id, businessId: BRIGHTWATER });
  });

  test("an unknown email gets no mail and the same answer, so nobody can probe for accounts", async () => {
    const before = ctx.providers.email.sent.length;
    await expect(requestLogin(ctx, "stranger@mail.example")).resolves.toBeUndefined();
    expect(ctx.providers.email.sent.length).toBe(before);
  });

  test("a link works once", async () => {
    await requestLogin(ctx, "jordan@brightwater.example");
    const token = linkIn(ctx.providers.email.sent.at(-1)!.text);
    expect(await verifyLogin(ctx, token)).not.toBeNull();
    expect(await verifyLogin(ctx, token)).toBeNull();
  });

  test("a link expires after 15 minutes", async () => {
    await requestLogin(ctx, "jordan@brightwater.example");
    const token = linkIn(ctx.providers.email.sent.at(-1)!.text);
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect(await verifyLogin(ctx, token)).toBeNull();
  });

  test("only a hash of the link is stored", async () => {
    await requestLogin(ctx, "sam@brightwater.example");
    const token = linkIn(ctx.providers.email.sent.at(-1)!.text);
    const rows = await db.admin.query<{ token_hash: string }>(`select token_hash from login_tokens`);
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
  });
});

describe("sessions", () => {
  const signIn = async (email: string) => {
    await requestLogin(ctx, email);
    return (await verifyLogin(ctx, linkIn(ctx.providers.email.sent.at(-1)!.text)))!;
  };

  test("a team member signs in as team", async () => {
    expect((await actorFromCookie(ctx, await signIn("jordan@brightwater.example")))?.role).toBe("team");
  });

  test("a forged or altered cookie is refused", async () => {
    const cookie = await signIn("sam@brightwater.example");
    expect(await actorFromCookie(ctx, cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(await actorFromCookie(ctx, "nonsense")).toBeNull();
  });

  test("signing out ends the session on the server, not just in the browser", async () => {
    const cookie = await signIn("sam@brightwater.example");
    await signOut(ctx, cookie);
    expect(await actorFromCookie(ctx, cookie)).toBeNull();
  });

  test("a session ends after 12 hours", async () => {
    const cookie = await signIn("sam@brightwater.example");
    clock = new Date(clock.getTime() + 13 * 3_600_000);
    expect(await actorFromCookie(ctx, cookie)).toBeNull();
  });

  test("each sign-in is in the owner's audit log", async () => {
    const rows = await db.as({ role: "owner", id: SEED.owner.id, businessId: BRIGHTWATER }, (tx) =>
      tx.query<{ n: string }>(`select count(*) n from audit_log where target_table = 'sessions' and action = 'insert'`),
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });
});

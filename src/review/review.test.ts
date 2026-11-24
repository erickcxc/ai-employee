import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { openDb, type Db } from "@/db";
import { BRIGHTWATER, SEED, seed } from "@/db/seed";
import { providers } from "@/providers";
import { checkRules } from "./rules";
import { reviewText } from "./review";
import { createDraft, decideDraft } from "./approvals";

describe("rules in code (run before any model)", () => {
  test("a plain, factual text passes", () => {
    expect(checkRules("Hi Dana, Sam can come Thursday 9 to 11 to look at the water heater.")).toEqual({ pass: true, reasons: [] });
  });

  test.each([
    ["The visit is $150.", "price"],
    ["It will cost about 200 dollars.", "price"],
    ["We guarantee it's fixed today.", "promise"],
    ["Book now, limited time only!!", "pushy"],
    ["Details at https://brightwater.example/offer", "link"],
    ["x".repeat(400), "too long"],
  ])("fails %p for %p", (text, reason) => {
    const r = checkRules(text);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toContain(reason);
  });
});

describe("the review agent", () => {
  test("a rules failure never reaches the model", async () => {
    const p = providers({ PROVIDERS: "fake" }); // no scripted answers: any model call would throw
    const r = await reviewText("Only $99 today!", p.llm);
    expect(r.pass).toBe(false);
    expect(r.by).toBe("rules");
  });

  test("passes only when the model passes it", async () => {
    expect((await reviewText("Sam will be there Thursday.", providers({ PROVIDERS: "fake" }, { llm: [{ pass: true, reasons: [] }] }).llm)).pass).toBe(true);
    const no = await reviewText("Sam will be there Thursday.", providers({ PROVIDERS: "fake" }, { llm: [{ pass: false, reasons: ["sounds pushy"] }] }).llm);
    expect(no).toEqual({ pass: false, reasons: ["sounds pushy"], by: "model" });
  });

  test("fails closed when the model errors or answers in the wrong shape", async () => {
    expect((await reviewText("Sam will be there Thursday.", providers({ PROVIDERS: "fake" }).llm)).reasons).toEqual(["review unavailable"]);
    expect((await reviewText("Sam will be there Thursday.", providers({ PROVIDERS: "fake" }, { llm: [{ ok: "yes" }] }).llm)).pass).toBe(false);
  });
});

describe("drafts and approvals", () => {
  let db: Db;
  const NOW = new Date("2026-11-16T14:30:00Z");
  const key = fieldKey({ PROVIDERS: "fake" });
  const owner = { role: "owner" as const, id: SEED.owner.id, businessId: BRIGHTWATER };
  const team = { role: "team" as const, id: SEED.team[0].id, businessId: BRIGHTWATER };
  const priya = SEED.customers[0];

  beforeAll(async () => {
    db = await openDb();
    await db.migrate();
    await seed(db, { now: NOW, key });
  });
  afterAll(() => db.close());

  const ctx = (llm: unknown[] = [{ pass: true, reasons: [] }]) => {
    const p = providers({ PROVIDERS: "fake" }, { llm });
    return { db, key, businessId: BRIGHTWATER, providers: p };
  };

  test("Mike's draft is reviewed, then waits as pending; nothing is sent", async () => {
    const c = ctx();
    const r = await createDraft(c, { customerId: priya.id, body: "Hi Priya, Sam can look at the water heater Tuesday 9 to 11. Does that work?" });
    expect(r.drafted).toBe(true);
    expect(c.providers.sms.sent).toEqual([]);
    const [d] = await db.as(owner, (tx) => tx.query<{ status: string; created_by: string }>(`select status, created_by from drafts where id = $1`, [r.id]));
    expect(d).toEqual({ status: "pending", created_by: "agent:mike" });
  });

  test("a draft that fails review is not stored; Mike gets the reasons to rewrite", async () => {
    const r = await createDraft(ctx([]), { customerId: priya.id, body: "Replacing it runs $1,800." });
    expect(r.drafted).toBe(false);
    expect(r.reasons!.join(" ")).toContain("price");
  });

  test("the owner's tap sends it to the customer's real number, logs the message, marks it sent", async () => {
    const c = ctx();
    const { id } = await createDraft(c, { customerId: priya.id, body: "Hi Priya, Sam can come Tuesday 9 to 11." });
    const r = await decideDraft(c, owner, id!, { action: "approve" });
    expect(r).toEqual({ ok: true, status: "sent" });
    expect(c.providers.sms.sent).toEqual([{ to: priya.phone, body: "Hi Priya, Sam can come Tuesday 9 to 11." }]);
    const [m] = await db.as(owner, (tx) => tx.query<{ direction: string }>(`select direction from messages where customer_id = $1 order by at desc limit 1`, [priya.id]));
    expect(m.direction).toBe("out");
    const actors = await db.as(owner, (tx) => tx.query<{ actor: string }>(`select distinct actor from audit_log where target_id = $1 order by actor`, [id]));
    expect(actors.map((a) => a.actor)).toEqual(["agent:mike", `owner:${SEED.owner.id}`]);
  });

  test("the owner can edit before sending; the edit must still pass the rules", async () => {
    const c = ctx();
    const { id } = await createDraft(c, { customerId: priya.id, body: "Hi Priya, Sam can come Tuesday." });
    expect(await decideDraft(c, owner, id!, { action: "approve", body: "Hi Priya, it's $90 to come out." })).toEqual({ ok: false, reasons: ["mentions a price"] });
    expect(await decideDraft(c, owner, id!, { action: "approve", body: "Hi Priya, Sam can come Tuesday morning." })).toEqual({ ok: true, status: "sent" });
    expect(c.providers.sms.sent.at(-1)!.body).toBe("Hi Priya, Sam can come Tuesday morning.");
  });

  test("a rejected draft is never sent, and a decided draft cannot be decided again", async () => {
    const c = ctx();
    const { id } = await createDraft(c, { customerId: priya.id, body: "Hi Priya, checking in about the water heater." });
    expect(await decideDraft(c, owner, id!, { action: "reject" })).toEqual({ ok: true, status: "rejected" });
    expect(await decideDraft(c, owner, id!, { action: "approve" })).toEqual({ ok: false, reasons: ["already decided"] });
    expect(c.providers.sms.sent).toEqual([]);
  });

  test("a send that failed can be retried from the app, and is sent once", async () => {
    const c = ctx();
    const { id } = await createDraft(c, { customerId: priya.id, body: "Hi Priya, Sam can come Wednesday." });
    const send = c.providers.sms.send;
    c.providers.sms.send = async () => { throw new Error("carrier down"); };
    expect((await decideDraft(c, owner, id!, { action: "approve" })).ok).toBe(false);
    const waiting = await db.as(owner, (tx) => tx.query<{ status: string }>(`select status from drafts where id = $1`, [id]));
    expect(waiting[0].status).toBe("approved");
    c.providers.sms.send = send;
    expect(await decideDraft(c, owner, id!, { action: "approve" })).toEqual({ ok: true, status: "sent" });
    expect(c.providers.sms.sent.filter((m) => m.body === "Hi Priya, Sam can come Wednesday.")).toHaveLength(1);
    expect(await decideDraft(c, owner, id!, { action: "approve" })).toEqual({ ok: false, reasons: ["already decided"] });
  });

  test("an approval is logged in the approving owner's business, not a default one", async () => {
    const c = { ...ctx(), businessId: "00000000-0000-4000-8000-0000000000ff" };
    const { id } = await createDraft(ctx(), { customerId: priya.id, body: "Hi Priya, Sam can come Friday." });
    expect(await decideDraft(c, owner, id!, { action: "approve" })).toEqual({ ok: true, status: "sent" });
  });

  test("only the owner can approve", async () => {
    const c = ctx();
    const { id } = await createDraft(c, { customerId: priya.id, body: "Hi Priya, Sam can come Tuesday." });
    expect(await decideDraft(c, team, id!, { action: "approve" })).toEqual({ ok: false, reasons: ["only the owner can approve"] });
    expect(c.providers.sms.sent).toEqual([]);
  });
});

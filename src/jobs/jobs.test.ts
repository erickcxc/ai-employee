import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { openDb, verifyAuditChain, type Db } from "@/db";
import { BRIGHTWATER, SEED, seed } from "@/db/seed";
import { providers } from "@/providers";
import { runTool, startCall } from "@/agent/tools";
import { decideDraft } from "@/review/approvals";
import { afterCall, buildBriefing, deleteCustomer, gradeCall, runRetention } from "./index";

let db: Db;
const NOW = new Date("2026-11-16T14:30:00Z");
const key = fieldKey({ PROVIDERS: "fake" });
const owner = { role: "owner" as const, id: SEED.owner.id, businessId: BRIGHTWATER };
const team = { role: "team" as const, id: SEED.team[0].id, businessId: BRIGHTWATER };
const rows = <T>(sql: string, p: unknown[] = []) => db.as(owner, (tx) => tx.query<T>(sql, p));
const deps = () => ({ db, key, businessId: BRIGHTWATER, now: () => NOW });
const ctx = (llm: unknown[] = []) => ({ db, key, businessId: BRIGHTWATER, providers: providers({ PROVIDERS: "fake" }, { llm }), now: () => NOW });

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  await seed(db, { now: NOW, key });
});
afterAll(() => db.close());

async function finishedCall(args: Record<string, unknown>) {
  const callId = await startCall(deps());
  await runTool(deps(), callId, "finish_call", args);
  return callId;
}

describe("follow-up after a call", () => {
  test("a lead gets a reviewed follow-up text waiting for the owner", async () => {
    const callId = await finishedCall({ verdict: "customer", urgent: false, name: "Omar Haddad", phone: "+12175550170", address: "4 Cedar Lane, Springfield", summary: "Wants a new kitchen faucet installed." });
    const r = await afterCall(ctx([{ text: "Hi Omar, this is Brightwater Plumbing. Sam will text you to set up a time for the faucet." }, { pass: true, reasons: [] }]), callId);
    expect(r.drafted).toBe(true);
    const [d] = await rows<{ status: string; body: string; customer: string }>(`select d.status, d.body, c.name customer from drafts d join customers c on c.id = d.customer_id where d.id = $1`, [r.draftId]);
    expect(d).toEqual({ status: "pending", body: "Hi Omar, this is Brightwater Plumbing. Sam will text you to set up a time for the faucet.", customer: "Omar Haddad" });
  });

  test("a draft that fails review is rewritten once with the reasons, then dropped if it fails again", async () => {
    const callId = await finishedCall({ verdict: "customer", urgent: false, name: "Ivy Chen", phone: "+12175550171", address: "8 Pine Row, Springfield", summary: "Slow drain." });
    const r = await afterCall(ctx([{ text: "Drain cleaning is $120." }, { text: "Still $120, sorry." }]), callId);
    expect(r).toEqual({ drafted: false, reason: "review failed: mentions a price" });
  });

  test("spam gets nothing", async () => {
    const callId = await finishedCall({ verdict: "spam", urgent: false, name: null, phone: null, address: null, summary: "Selling SEO." });
    expect(await afterCall(ctx(), callId)).toEqual({ drafted: false, reason: "no follow-up for spam" });
  });
});

describe("call grading", () => {
  test("code checks the record, a second model checks the conversation", async () => {
    const callId = await finishedCall({ verdict: "customer", urgent: true, name: "Lena Ford", phone: "+12175550172", address: "15 Oak Street, Springfield", summary: "Burst pipe in the basement." });
    await db.as({ role: "agent", id: "mike", businessId: BRIGHTWATER }, (tx) => tx.query(`update calls set transcript = $1 where id = $2`, [[{ who: "caller", text: "Water everywhere in the basement" }, { who: "mike", text: "I've flagged this as urgent." }], callId]));
    const grade = await gradeCall(ctx([{ urgency_right: true, rules_followed: true, notes: [] }]), callId);
    expect(grade).toEqual({ details_complete: true, urgency_right: true, rules_followed: true });
    const [c] = await rows<{ grade: unknown }>(`select grade from calls where id = $1`, [callId]);
    expect(c.grade).toEqual(grade);
  });

  test("a customer call with no address is incomplete, whatever the model says", async () => {
    const callId = await finishedCall({ verdict: "customer", urgent: false, name: "Nate Cole", phone: "+12175550173", address: null, summary: "Leaky tap." });
    expect((await gradeCall(ctx([{ urgency_right: true, rules_followed: true, notes: [] }]), callId)).details_complete).toBe(false);
  });

  test("if the grader fails, the call shows as needing a look, never as passed", async () => {
    const callId = await finishedCall({ verdict: "message", urgent: false, name: "Linda Reyes", phone: "+12175550103", address: null, summary: "Invoice question." });
    const grade = await gradeCall(ctx([]), callId);
    expect(grade.rules_followed).toBe(false);
    expect(grade.urgency_right).toBe(false);
  });
});

describe("morning briefing", () => {
  test("lists the day's visits, what waits on the owner and urgent leads, as a draft for the owner", async () => {
    const day = new Date("2026-11-18T11:00:00Z"); // Wednesday, 6 AM in Springfield
    const r = await buildBriefing({ ...ctx(), now: () => day });
    expect(r.created).toBe(true);
    const [d] = await rows<{ body: string; kind: string; status: string }>(`select body, kind, status from drafts where id = $1`, [r.draftId]);
    expect(d.kind).toBe("briefing");
    expect(d.status).toBe("pending");
    expect(d.body).toContain("1 to 3 PM: Marcus Bell, Sump pump replacement");
    expect(d.body).toMatch(/waiting for your OK/);
    expect(d.body).toContain("Urgent: Tom Okafor");
  });

  test("is built once a day", async () => {
    const day = new Date("2026-11-18T11:30:00Z");
    expect((await buildBriefing({ ...ctx(), now: () => day })).created).toBe(false);
  });

  test("once the owner approves, it is emailed to the team, not texted to a customer", async () => {
    const c = ctx();
    const [d] = await rows<{ id: string }>(`select id from drafts where kind = 'briefing' and status = 'pending'`);
    expect(await decideDraft(c, owner, d.id, { action: "approve" })).toEqual({ ok: true, status: "sent" });
    expect(c.providers.sms.sent).toEqual([]);
    expect(c.providers.email.sent.map((m) => m.to).sort()).toEqual(["jordan@brightwater.example", "sam@brightwater.example"]);
  });
});

describe("briefing edits", () => {
  test("the owner can edit a long briefing before sending; the text-length rule is for texts only", async () => {
    const c = ctx();
    const r = await buildBriefing({ ...c, now: () => new Date("2026-11-19T11:00:00Z") });
    const long = `Good morning, Sam.\n${"- 9 to 11 AM: a visit with plenty of notes about the job\n".repeat(8)}`;
    expect(long.length).toBeGreaterThan(320);
    expect(await decideDraft(c, owner, r.draftId!, { action: "approve", body: long })).toEqual({ ok: true, status: "sent" });
  });
});

describe("retention and deletion", () => {
  test("old transcripts are cleared, expired sign-in links and old sessions removed; the calls themselves stay", async () => {
    const callId = await finishedCall({ verdict: "message", urgent: false, name: "Old Caller", phone: "+12175550174", address: null, summary: "Old." });
    await db.admin.query(`update calls set started_at = $1, transcript = '[{"who":"caller","text":"hi"}]' where id = $2`, [new Date(NOW.getTime() - 100 * 86_400_000), callId]);
    const r = await runRetention(db, NOW);
    expect(r.transcriptsCleared).toBeGreaterThanOrEqual(1);
    const [c] = await rows<{ transcript: unknown; summary: string }>(`select transcript, summary from calls where id = $1`, [callId]);
    expect(c).toEqual({ transcript: null, summary: "Old." });
  });

  test("deleting a customer also removes the briefings that name them", async () => {
    const dana = SEED.customers.find((c) => c.name === "Dana Cole")!;
    await db.admin.query(`insert into drafts (business_id, kind, body, status, created_by) values ($1, 'briefing', $2, 'sent', 'agent:briefing')`, [BRIGHTWATER, `Today:\n- 9 to 11 AM: ${dana.name}, water heater`]);
    expect(await deleteCustomer(ctx(), owner, dana.id)).toMatchObject({ ok: true });
    expect(await rows(`select 1 from drafts where position($1 in body) > 0`, [dana.name])).toEqual([]);
  });

  test("the owner can delete a customer everywhere; the audit log keeps that it happened, not what was said", async () => {
    const tom = SEED.customers.find((c) => c.name === "Tom Okafor")!;
    expect(await deleteCustomer(ctx(), team, tom.id)).toEqual({ ok: false, reason: "only the owner can delete customer data" });
    expect(await deleteCustomer(ctx(), owner, tom.id)).toMatchObject({ ok: true });
    for (const t of ["customers", "jobs", "calls", "messages", "drafts"]) {
      const col = t === "customers" ? "id" : "customer_id";
      expect(await rows(`select 1 from ${t} where ${col} = $1`, [tom.id])).toEqual([]);
    }
    const [del] = await rows<{ actor: string; detail: unknown }>(`select actor, detail from audit_log where target_id = $1 and action = 'delete'`, [tom.id]);
    expect(del.actor).toBe(`owner:${SEED.owner.id}`);
    expect(JSON.stringify(del)).not.toContain("Okafor");
    expect(await verifyAuditChain(db)).toEqual({ ok: true });
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { openDb, type Db } from "@/db";
import { BRIGHTWATER, SEED, seed } from "@/db/seed";
import { callList, textThread, textThreads, today } from "./queries";

let db: Db;
const NOW = new Date("2026-11-16T14:30:00Z");
const owner = { role: "owner" as const, id: SEED.owner.id, businessId: BRIGHTWATER };
const team = { role: "team" as const, id: SEED.team[0].id, businessId: BRIGHTWATER };
const dana = SEED.customers.find((c) => c.name === "Dana Cole")!;

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  await seed(db, { now: NOW, key: fieldKey({ PROVIDERS: "fake" }) });
});
afterAll(() => db.close());

describe("Today", () => {
  test("puts what waits on the owner first: Mike's reply to Dana", async () => {
    const t = await today(db, owner, NOW);
    expect(t.waiting).toEqual([{ id: expect.any(String), customerId: dana.id, customer: "Dana Cole", body: "Yes, a written quote on the spot. See you Thursday!", kind: "text", status: "pending" }]);
  });

  test("shows the pipeline and the next visits, with names and work, never contact details", async () => {
    const t = await today(db, owner, NOW);
    expect(t.pipeline).toEqual({ lead: 3, scheduled: 3, done: 1, paid: 2 });
    expect(t.visits[0]).toEqual({ when: "Wednesday, Nov 18, 1 to 3 PM", customer: "Marcus Bell", job: "Sump pump replacement" });
    expect(JSON.stringify(t)).not.toMatch(/555|Linden|v1\./);
  });

  test("the last call is the newest one", async () => {
    expect((await today(db, owner, NOW)).lastCall?.summary).toBe("Wants a quote to replace an old water heater.");
  });

  test("a team member sees the same day", async () => {
    expect((await today(db, team, NOW)).waiting).toHaveLength(1);
  });
});

describe("Texts", () => {
  test("lists conversations with the latest message first", async () => {
    const threads = await textThreads(db, owner);
    expect(threads[0]).toMatchObject({ customerId: dana.id, customer: "Dana Cole", last: "Great. Quote then too?", waiting: true });
  });

  test("a thread reads in order, with the pending reply at the end", async () => {
    const t = await textThread(db, owner, dana.id);
    expect(t.messages.map((m) => [m.direction, m.body])).toEqual([
      ["in", "Can someone look at our water heater this week?"],
      ["out", "Yes, Thursday morning works. 9 to 11?"],
      ["in", "Great. Quote then too?"],
    ]);
    expect(t.draft?.body).toBe("Yes, a written quote on the spot. See you Thursday!");
  });
});

describe("Calls", () => {
  test("every call with its outcome, newest first; spam has no customer", async () => {
    const calls = await callList(db, owner);
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.outcome)).toContain("spam");
    expect(calls.find((c) => c.outcome === "spam")?.customer).toBeNull();
    expect(calls.find((c) => c.urgent)?.customer).toBe("Tom Okafor");
  });

  test("a grade is a list of checks that passed or failed, so a calm call that was handled right passes", async () => {
    const calls = await callList(db, owner);
    for (const c of calls) expect(Object.values(c.grade ?? {}).every(Boolean)).toBe(true);
  });
});

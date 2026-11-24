import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { decryptField, fieldKey } from "./crypto";
import { openDb, verifyAuditChain, type Db } from "./index";
import { assertSynthetic, BRIGHTWATER, SEED, seed } from "./seed";

let db: Db;
const NOW = new Date("2026-11-16T14:30:00Z"); // a Monday, 9:30 AM in Springfield
const key = fieldKey({ PROVIDERS: "fake" });

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  await seed(db, { now: NOW, key });
});
afterAll(() => db.close());

const owner = { role: "owner" as const, id: SEED.owner.id, businessId: BRIGHTWATER };

describe("the Brightwater seed", () => {
  test("is a believable book of business, not an empty demo", async () => {
    const count = async (t: string) => Number((await db.as(owner, (tx) => tx.query<{ n: string }>(`select count(*) n from ${t}`)))[0].n);
    expect(await count("customers")).toBeGreaterThanOrEqual(10);
    expect(await count("jobs")).toBeGreaterThanOrEqual(8);
    expect(await count("calls")).toBeGreaterThanOrEqual(5);
    const slots = await db.as(owner, (tx) => tx.query<{ status: string }>(`select status from slots where starts_at > $1`, [NOW]));
    expect(slots.some((s) => s.status === "open")).toBe(true);
    expect(slots.some((s) => s.status === "booked")).toBe(true);
  });

  test("has one draft waiting for the owner, the Dana Cole reply from the team app", async () => {
    const drafts = await db.as(owner, (tx) => tx.query<{ body: string; status: string }>(`select body, status from drafts`));
    expect(drafts).toEqual([{ body: "Yes, a written quote on the spot. See you Thursday!", status: "pending" }]);
  });

  test("stores contact details encrypted, and they decrypt to the seed", async () => {
    const [row] = await db.as(owner, (tx) => tx.query<{ phone_enc: string }>(`select phone_enc from customers where name = 'Tom Okafor'`));
    expect(row.phone_enc).not.toContain("555");
    expect(decryptField(row.phone_enc, key)).toBe(SEED.customers.find((c) => c.name === "Tom Okafor")!.phone);
  });

  test("is fully synthetic: fictional 555-01xx numbers, .example emails, invented streets", () => {
    expect(() => assertSynthetic(SEED)).not.toThrow();
  });

  test("leaves a valid audit chain", async () => {
    expect(await verifyAuditChain(db)).toEqual({ ok: true });
  });
});

describe("the synthetic check", () => {
  test("rejects a phone number outside the fictional 555-0100 to 555-0199 range", () => {
    const bad = { ...SEED, customers: [{ ...SEED.customers[0], phone: "+12175551234" }] };
    expect(() => assertSynthetic(bad)).toThrow("phone");
  });

  test("rejects an email on a real domain", () => {
    const bad = { ...SEED, customers: [{ ...SEED.customers[0], email: "priya@gmail.com" }] };
    expect(() => assertSynthetic(bad)).toThrow("email");
  });
});

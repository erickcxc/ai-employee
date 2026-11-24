// The restore test (SOC 2 A1.2, A1.3): a backup is only a backup once it has been restored. This takes
// a full backup of a seeded database, restores it into a new one and checks that nothing was lost:
// every row, the audit chain, row-level security and the encrypted fields.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { decryptField, fieldKey } from "@/db/crypto";
import { openDb, type Db } from "@/db";
import { BRIGHTWATER, seed } from "@/db/seed";
import { tableCounts, verifyRestore } from "./backup";

const NOW = new Date("2026-11-16T14:30:00Z");
const key = fieldKey({ PROVIDERS: "fake" });
let source: Db;
let restored: Db;

beforeAll(async () => {
  source = await openDb();
  await source.migrate();
  await seed(source, { now: NOW, key });
  restored = await openDb({ restoreFrom: await source.backup() });
});
afterAll(async () => {
  await source.close();
  await restored.close();
});

describe("backup and restore", () => {
  test("a restored database has every row the original had", async () => {
    const before = await tableCounts(source);
    expect(before.customers).toBeGreaterThan(0);
    expect(await tableCounts(restored)).toEqual(before);
  });

  test("the restore check passes: audit chain intact, row-level security still forced, no migration missing", async () => {
    expect(await verifyRestore(restored, await tableCounts(source))).toEqual({ ok: true, problems: [] });
  });

  test("encrypted contact details survive the restore and still need the key", async () => {
    const [c] = await restored.as({ role: "owner", id: "restore-check", businessId: BRIGHTWATER }, (tx) =>
      tx.query<{ phone_enc: string }>(`select phone_enc from customers where phone_enc is not null limit 1`),
    );
    expect(decryptField(c.phone_enc, key)).toMatch(/^\+121755501\d\d$/);
    expect(() => decryptField(c.phone_enc, Buffer.alloc(32, 7))).toThrow();
  });

  test("the restore check catches a restore that lost rows", async () => {
    const counts = await tableCounts(source);
    const r = await verifyRestore(restored, { ...counts, customers: counts.customers + 1 });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain(`customers: expected ${counts.customers + 1} rows, found ${counts.customers}`);
  });
});

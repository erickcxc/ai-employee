// The roles a production deployment connects with (docs/compliance/policies/access-control.md).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fieldKey } from "@/db/crypto";
import { BRIGHTWATER, seed } from "@/db/seed";
import { runRetention } from "@/jobs";
import { openDb, type Db } from "./index";

let db: Db;
const NOW = new Date("2026-11-16T14:30:00Z");

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  await seed(db, { now: NOW, key: fieldKey({ PROVIDERS: "fake" }) });
});
afterAll(() => db.close());

describe("database roles", () => {
  test("the app's login joins app_runtime, which can switch into each app role and has no rights of its own", async () => {
    const [r] = await db.admin.query<Record<string, boolean>>(
      `select pg_has_role('app_runtime', 'app_owner', 'member') o, pg_has_role('app_runtime', 'app_team', 'member') t,
              pg_has_role('app_runtime', 'app_agent', 'member') a, pg_has_role('app_runtime', 'app_auth', 'member') au,
              pg_has_role('app_runtime', 'app_system', 'member') s,
              has_table_privilege('app_runtime', 'customers', 'select') own_rights`,
    );
    expect(r).toEqual({ o: true, t: true, a: true, au: true, s: true, own_rights: false });
  });

  test("scheduled jobs run as app_system, which can clear old data but cannot read customers", async () => {
    await expect(db.asSystem("probe", (tx) => tx.query(`select name from customers`))).rejects.toThrow("permission denied");
    const [{ id }] = await db.admin.query<{ id: string }>(
      `insert into calls (business_id, started_at, transcript) values ($1, $2, '[]') returning id`,
      [BRIGHTWATER, new Date(NOW.getTime() - 200 * 86_400_000)],
    );
    expect((await runRetention(db, NOW)).transcriptsCleared).toBeGreaterThanOrEqual(1);
    const [c] = await db.admin.query<{ transcript: unknown }>(`select transcript from calls where id = $1`, [id]);
    expect(c.transcript).toBeNull();
  });
});

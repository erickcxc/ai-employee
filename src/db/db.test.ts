import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openDb, verifyAuditChain, type Actor, type Db } from "./index";

let db: Db;
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const owner: Actor = { role: "owner", id: "11111111-1111-4111-8111-111111111111", businessId: A };
const team: Actor = { role: "team", id: "22222222-2222-4222-8222-222222222222", businessId: A };
const agent: Actor = { role: "agent", id: "mike", businessId: A };
const ownerB: Actor = { role: "owner", id: "33333333-3333-4333-8333-333333333333", businessId: B };

beforeAll(async () => {
  db = await openDb();
  await db.migrate();
  await db.admin.query(`insert into businesses (id, name, timezone) values ($1, 'Brightwater Plumbing', 'America/New_York'), ($2, 'Other Co', 'America/Chicago')`, [A, B]);
  await db.admin.query(`insert into people (id, business_id, name, role) values ($1, $2, 'Sam', 'owner'), ($3, $2, 'Jordan', 'team')`, [owner.id, A, team.id]);
});
afterAll(() => db.close());

const newCustomer = (tx: { query: Db["admin"]["query"] }, name: string) =>
  tx.query<{ id: string }>(`insert into customers (business_id, name, phone_enc, phone_hash) values (current_setting('app.business_id')::uuid, $1, 'v1.x.y.z', $2) returning id`, [name, `h-${name}`]);

describe("migrations", () => {
  test("a second run applies nothing", async () => {
    expect(await db.migrate()).toEqual([]);
  });

  test("every table has row-level security on and forced, so not even the table owner skips it", async () => {
    const rows = await db.admin.query<{ relname: string; on: boolean; forced: boolean }>(
      `select c.relname, c.relrowsecurity as on, c.relforcerowsecurity as forced from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const r of rows) expect({ t: r.relname, on: r.on, forced: r.forced }).toEqual({ t: r.relname, on: true, forced: true });
  });
});

describe("access control", () => {
  test("a business never sees another business's rows", async () => {
    await db.as(owner, (tx) => newCustomer(tx, "Priya Nandakumar"));
    const seen = await db.as(ownerB, (tx) => tx.query(`select id from customers`));
    expect(seen).toEqual([]);
  });

  test("the agent cannot delete customers", async () => {
    const [c] = await db.as(owner, (tx) => newCustomer(tx, "Tom Okafor"));
    await db.as(agent, (tx) => tx.query(`delete from customers where id = $1`, [c.id])).catch(() => {});
    const still = await db.as(owner, (tx) => tx.query(`select id from customers where id = $1`, [c.id]));
    expect(still).toHaveLength(1);
  });

  test("the agent can write a draft only as pending, and only the owner can approve it", async () => {
    const [c] = await db.as(owner, (tx) => newCustomer(tx, "Dana Cole"));
    const draft = (status: string) =>
      db.as(agent, (tx) =>
        tx.query<{ id: string }>(
          `insert into drafts (business_id, customer_id, kind, body, status, created_by) values (current_setting('app.business_id')::uuid, $1, 'text', 'Sam can come Thursday 9 to 11.', $2, 'agent:mike') returning id`,
          [c.id, status],
        ),
      );
    await expect(draft("approved")).rejects.toThrow();
    const [d] = await draft("pending");
    await expect(db.as(team, (tx) => tx.query(`update drafts set status = 'approved' where id = $1 returning id`, [d.id]))).rejects.toThrow("permission denied");
    await expect(db.as(agent, (tx) => tx.query(`update drafts set status = 'approved' where id = $1`, [d.id]))).rejects.toThrow();
    const ok = await db.as(owner, (tx) => tx.query(`update drafts set status = 'approved', decided_by = $2, decided_at = now() where id = $1 returning id`, [d.id, owner.id]));
    expect(ok).toHaveLength(1);
  });
});

describe("audit log", () => {
  test("every write leaves a row naming who did it", async () => {
    const [c] = await db.as(agent, (tx) => newCustomer(tx, "Linda Reyes"));
    const rows = await db.as(owner, (tx) => tx.query<{ actor: string; action: string; target_table: string }>(`select actor, action, target_table from audit_log where target_id = $1`, [c.id]));
    expect(rows).toEqual([{ actor: "agent:mike", action: "insert", target_table: "customers" }]);
  });

  test("only the owner can read it", async () => {
    await expect(db.as(agent, (tx) => tx.query(`select * from audit_log`))).rejects.toThrow();
    await expect(db.as(team, (tx) => tx.query(`select * from audit_log`))).rejects.toThrow();
  });

  test("nobody can change or delete a row, the owner included", async () => {
    await expect(db.as(owner, (tx) => tx.query(`update audit_log set action = 'x'`))).rejects.toThrow();
    await expect(db.as(owner, (tx) => tx.query(`delete from audit_log`))).rejects.toThrow();
    await expect(db.admin.query(`update audit_log set action = 'x'`)).rejects.toThrow("append-only");
  });

  test("the hash chain verifies, and a row edited behind its back breaks it", async () => {
    expect(await verifyAuditChain(db)).toEqual({ ok: true });
    await db.admin.query(`alter table audit_log disable trigger audit_log_append_only`);
    const [{ id }] = await db.admin.query<{ id: string }>(`update audit_log set action = 'forged' where id = (select min(id) from audit_log) returning id`);
    await db.admin.query(`alter table audit_log enable trigger audit_log_append_only`);
    expect(await verifyAuditChain(db)).toEqual({ ok: false, brokenAt: Number(id) });
  });
});

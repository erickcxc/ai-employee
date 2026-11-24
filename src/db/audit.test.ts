// What the audit chain catches, and what it needs an outside anchor for (docs/compliance/controls.md CC7.2).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { auditHead, openDb, verifyAuditChain, type Db } from "./index";

let db: Db;
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const forge = async (sql: string) => {
  await db.admin.query(`alter table audit_log disable trigger audit_log_append_only`);
  await db.admin.query(sql);
  await db.admin.query(`alter table audit_log enable trigger audit_log_append_only`);
};

beforeEach(async () => {
  db = await openDb();
  await db.migrate();
  await db.admin.query(`insert into businesses (id, name, timezone) values ($1, 'Brightwater Plumbing', 'America/New_York'), ($2, 'Other Co', 'America/Chicago')`, [A, B]);
  await db.admin.query(`insert into slots (business_id, starts_at, ends_at) values ($1, now(), now() + interval '2 hours')`, [A]);
});
afterEach(() => db.close());

describe("the audit chain", () => {
  test("moving a row to another business breaks the chain", async () => {
    const [{ id }] = await db.admin.query<{ id: string }>(`select max(id) id from audit_log where business_id = $1`, [A]);
    await forge(`update audit_log set business_id = '${B}' where id = ${Number(id)}`);
    expect(await verifyAuditChain(db)).toEqual({ ok: false, brokenAt: Number(id) });
  });

  test("rows cut off the end are caught against a saved head", async () => {
    const head = await auditHead(db);
    await forge(`delete from audit_log where id = ${head!.id}`);
    expect(await verifyAuditChain(db)).toEqual({ ok: true });
    expect(await verifyAuditChain(db, head!)).toEqual({ ok: false, brokenAt: head!.id });
  });

  test("a rewrite of the whole chain is caught against a saved head", async () => {
    const head = await auditHead(db);
    await forge(`update audit_log set action = 'forged' where id = ${head!.id}`);
    await forge(`update audit_log set hash = audit_hash(id, business_id, prev_hash, at, actor, action, target_table, target_id, detail) where id = ${head!.id}`);
    expect(await verifyAuditChain(db)).toEqual({ ok: true });
    expect(await verifyAuditChain(db, head!)).toEqual({ ok: false, brokenAt: head!.id });
  });
});

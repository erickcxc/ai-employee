// The checks run after every restore, in the restore test and in a real restore drill
// (scripts/verify-restore.ts, docs/compliance/backup-restore.md). SOC 2 A1.2, A1.3.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { verifyAuditChain, type Db } from "@/db";

/** Row count of every table in the app schema. Take it before a backup; compare after the restore. */
export async function tableCounts(db: Db): Promise<Record<string, number>> {
  const tables = await db.admin.query<{ t: string }>(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  );
  const counts: Record<string, number> = {};
  // Table names come from the catalog, never from input.
  for (const { t } of tables) counts[t] = Number((await db.admin.query<{ n: number }>(`select count(*)::int as n from "${t}"`))[0].n);
  return counts;
}

/** Everything that must hold in a restored database before it takes traffic. */
export async function verifyRestore(db: Db, expected: Record<string, number>): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];

  const found = await tableCounts(db);
  for (const [t, n] of Object.entries(expected)) {
    if (found[t] !== n) problems.push(`${t}: expected ${n} rows, found ${found[t] ?? "no table"}`);
  }

  const chain = await verifyAuditChain(db);
  if (!chain.ok) problems.push(`audit chain broken at row ${chain.brokenAt}`);

  const unforced = await db.admin.query<{ t: string }>(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'
       and not (c.relrowsecurity and c.relforcerowsecurity)`,
  );
  for (const { t } of unforced) problems.push(`${t}: row-level security is not forced`);

  const applied = new Set((await db.admin.query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
  for (const f of readdirSync(join(process.cwd(), "db/migrations")).filter((f) => f.endsWith(".sql"))) {
    if (!applied.has(f)) problems.push(`migration not applied: ${f}`);
  }

  return { ok: problems.length === 0, problems };
}

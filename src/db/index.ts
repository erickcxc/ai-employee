// One way into the database. App code never connects with power: every query runs inside `as(actor)`,
// which switches to that actor's role (owner, team or agent) and scopes it to one business for the
// transaction, so row-level security and grants decide what it can touch (SOC 2 CC6.1, CC6.3).
// `admin` is for migrations, the seed and tests only.
// Local and tests: an in-process Postgres (PGlite). Production: any Postgres via DATABASE_URL.
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

export type Role = "owner" | "team" | "agent";
export type Actor = { role: Role; id: string; businessId: string };
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db {
  admin: Tx;
  as<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Scheduled jobs (retention): the app_system role, every write attributed to system:<name>. */
  asSystem<T>(name: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Sign-in only: the app_auth role, which can reach sign-in tables and nothing else. */
  asAuth<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  migrate(): Promise<string[]>;
  /** A full physical backup of the in-process database. Server Postgres is backed up with pg_dump
   *  or the host's snapshots instead (docs/compliance/backup-restore.md). */
  backup(): Promise<Blob>;
  close(): Promise<void>;
}

const MIGRATIONS = join(process.cwd(), "db/migrations");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Driver = {
  query: Tx["query"];
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx & { exec(sql: string): Promise<void> }) => Promise<T>): Promise<T>;
  backup(): Promise<Blob>;
  close(): Promise<void>;
};

function pglite(dataDir?: string, restoreFrom?: Blob): Driver {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite({ dataDir, ...(restoreFrom ? { loadDataDir: restoreFrom } : {}) });
  const wrap = (q: Pick<PGlite, "query" | "exec">) => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows,
    exec: async (sql: string) => void (await q.exec(sql)),
  });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    backup: () => pg.dumpDataDir("gzip"),
    close: () => pg.close(),
  };
}

function server(url: string): Driver {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const wrap = (q: postgres.Sql | postgres.TransactionSql) => ({
    query: async <T>(text: string, params: unknown[] = []) => (await q.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    exec: async (text: string) => void (await q.unsafe(text)),
  });
  return {
    ...wrap(sql),
    transaction: (fn) => sql.begin((tx) => fn(wrap(tx))) as never,
    backup: () => Promise.reject(new Error("back up server Postgres with pg_dump: see docs/compliance/backup-restore.md")),
    close: () => sql.end(),
  };
}

export async function openDb(opts: { url?: string; dataDir?: string; restoreFrom?: Blob } = {}): Promise<Db> {
  const d = opts.url ? server(opts.url) : pglite(opts.dataDir, opts.restoreFrom);
  return {
    admin: { query: d.query },

    async as(actor, fn) {
      if (!["owner", "team", "agent"].includes(actor.role)) throw new Error("unknown role");
      if (!UUID.test(actor.businessId) || !ACTOR_ID.test(actor.id)) throw new Error("bad actor");
      return d.transaction(async (tx) => {
        // Role names come from the fixed list above, never from input.
        await tx.exec(`set local role app_${actor.role}`);
        await tx.query(`select set_config('app.business_id', $1, true), set_config('app.actor', $2, true)`, [actor.businessId, `${actor.role}:${actor.id}`]);
        return fn({ query: tx.query });
      });
    },

    asSystem(name, fn) {
      if (!ACTOR_ID.test(name)) throw new Error("bad job name");
      return d.transaction(async (tx) => {
        await tx.exec(`set local role app_system`);
        await tx.query(`select set_config('app.actor', $1, true)`, [`system:${name}`]);
        return fn({ query: tx.query });
      });
    },

    asAuth(fn) {
      return d.transaction(async (tx) => {
        await tx.exec(`set local role app_auth`);
        await tx.query(`select set_config('app.actor', 'system:auth', true)`);
        return fn({ query: tx.query });
      });
    },

    async migrate() {
      await d.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
      const done = new Set((await d.query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
      const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
      const applied: string[] = [];
      for (const f of files) {
        if (done.has(f)) continue;
        const sql = await readFile(join(MIGRATIONS, f), "utf8");
        await d.transaction(async (tx) => {
          await tx.exec(sql);
          await tx.query(`insert into schema_migrations (name) values ($1)`, [f]);
        });
        applied.push(f);
      }
      return applied;
    },

    backup: () => d.backup(),
    close: () => d.close(),
  };
}

/** The newest audit row. The daily job writes it to the host's logs, outside the database, so a later
 *  check can prove nothing was cut off the end or rewritten up to that point. */
export async function auditHead(db: Db): Promise<{ id: number; hash: string } | null> {
  const [r] = await db.asSystem("audit-head", (tx) => tx.query<{ id: string | number; hash: string }>(`select id, hash from audit_log order by id desc limit 1`));
  return r ? { id: Number(r.id), hash: r.hash } : null;
}

/** Recomputes every audit row's hash in order: an edited, inserted or removed row in the middle breaks
 *  the chain. Rows cut off the end, or a chain rewritten by someone who can bypass the append-only
 *  trigger, are caught by passing a head saved earlier with `auditHead`. */
export async function verifyAuditChain(db: Db, anchor?: { id: number; hash: string }): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
  const rows = await db.admin.query<{ id: string | number; hash: string; ok: boolean }>(
    `select id, hash, (hash = audit_hash(id, business_id, prev_hash, at, actor, action, target_table, target_id, detail)
                 and prev_hash is not distinct from lag(hash) over (order by id)) as ok
     from audit_log order by id`,
  );
  const bad = rows.find((r) => !r.ok);
  if (bad) return { ok: false, brokenAt: Number(bad.id) };
  if (anchor) {
    const kept = rows.find((r) => Number(r.id) === anchor.id);
    if (!kept || kept.hash !== anchor.hash) return { ok: false, brokenAt: anchor.id };
  }
  return { ok: true };
}

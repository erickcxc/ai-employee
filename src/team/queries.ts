// What the team app shows, read as the signed-in person (owner or team), so row-level security
// applies to every screen. Lists carry names and the work, never contact details: those stay
// encrypted and are only decrypted to send an approved text.
import type { Actor, Db } from "@/db";
import { slotLabel } from "@/agent/tools";

type Status = "lead" | "scheduled" | "done" | "paid";
export type Waiting = { id: string; customerId: string | null; customer: string | null; body: string; kind: string; status: "pending" | "approved" };

export async function today(db: Db, actor: Actor, now: Date) {
  return db.as(actor, async (tx) => {
    const [biz] = await tx.query<{ timezone: string }>(`select timezone from businesses`);
    const waiting = await tx.query<Waiting>(
      `select d.id, d.customer_id as "customerId", c.name as customer, d.body, d.kind, d.status
       from drafts d left join customers c on c.id = d.customer_id where d.status in ('pending', 'approved') order by d.created_at`,
    );
    const counts = await tx.query<{ status: Status; n: string }>(`select status, count(*) n from jobs where status <> 'lost' group by status`);
    const pipeline = { lead: 0, scheduled: 0, done: 0, paid: 0 };
    for (const r of counts) pipeline[r.status] = Number(r.n);
    const visits = await tx.query<{ starts_at: Date; ends_at: Date; customer: string; job: string }>(
      `select s.starts_at, s.ends_at, c.name as customer, j.title as job from slots s
       join jobs j on j.id = s.job_id join customers c on c.id = j.customer_id
       where s.status = 'booked' and s.ends_at > $1 order by s.starts_at limit 5`,
      [now],
    );
    const [lastCall] = await tx.query<{ summary: string | null; outcome: string | null; customer: string | null; started_at: Date }>(
      `select k.summary, k.outcome, c.name as customer, k.started_at from calls k left join customers c on c.id = k.customer_id
       where k.outcome is not null order by k.started_at desc limit 1`,
    );
    return {
      waiting,
      pipeline,
      visits: visits.map((v) => ({ when: slotLabel(new Date(v.starts_at), new Date(v.ends_at), biz.timezone), customer: v.customer, job: v.job })),
      lastCall: lastCall ?? null,
    };
  });
}

export async function textThreads(db: Db, actor: Actor) {
  return db.as(actor, (tx) =>
    tx.query<{ customerId: string; customer: string; last: string; at: Date; waiting: boolean }>(
      `select distinct on (c.id) c.id as "customerId", c.name as customer, m.body as last, m.at,
              exists (select 1 from drafts d where d.customer_id = c.id and d.status in ('pending', 'approved')) as waiting
       from messages m join customers c on c.id = m.customer_id
       order by c.id, m.at desc`,
    ),
  ).then((rows) => rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));
}

export async function textThread(db: Db, actor: Actor, customerId: string) {
  return db.as(actor, async (tx) => {
    const [customer] = await tx.query<{ name: string }>(`select name from customers where id = $1`, [customerId]);
    const messages = await tx.query<{ direction: "in" | "out"; body: string; at: Date }>(
      `select direction, body, at from messages where customer_id = $1 order by at`,
      [customerId],
    );
    const [draft] = await tx.query<{ id: string; body: string; status: "pending" | "approved" }>(
      `select id, body, status from drafts where customer_id = $1 and status in ('pending', 'approved') order by created_at desc limit 1`,
      [customerId],
    );
    return { customer: customer?.name ?? null, messages, draft: draft ?? null };
  });
}

export async function callList(db: Db, actor: Actor) {
  return db.as(actor, (tx) =>
    tx.query<{ id: string; started_at: Date; outcome: string | null; urgent: boolean; summary: string | null; customer: string | null; grade: Record<string, boolean> | null }>(
      `select k.id, k.started_at, k.outcome, k.urgent, k.summary, c.name as customer, k.grade
       from calls k left join customers c on c.id = k.customer_id
       where k.outcome is not null order by k.started_at desc limit 50`,
    ),
  );
}

import { Card, DraftCard, ErrorNote } from "@/components/ui";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";
import { today } from "@/team/queries";

export default async function Today({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const { deps } = await context();
  const t = await today(deps.db, actor, deps.now());
  const { error } = await searchParams;
  const total = t.pipeline.lead + t.pipeline.scheduled + t.pipeline.done + t.pipeline.paid;
  return (
    <main className="grid gap-4">
      <h1 className="text-[28px] font-semibold">Today</h1>
      <ErrorNote error={error} />
      <Card title="Waiting on you" tone={t.waiting.length ? "wait" : undefined}>
        {t.waiting.length ? (
          <div className="grid gap-3">{t.waiting.map((d) => <DraftCard key={d.id} draft={d} canApprove={actor.role === "owner"} back="/today" />)}</div>
        ) : (
          <p className="text-[15px] text-[var(--muted)]">Nothing waiting. Mike will put drafts here.</p>
        )}
      </Card>
      <Card title="Pipeline">
        <div className="grid grid-cols-4 gap-2 text-center">
          {(["lead", "scheduled", "done", "paid"] as const).map((k) => (
            <div key={k}>
              <p className="text-[22px] font-semibold">{t.pipeline[k]}</p>
              <p className="text-[12px] text-[var(--muted)] capitalize">{k === "lead" ? "Leads" : k}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[var(--teal)]" style={{ width: `${total ? ((t.pipeline.done + t.pipeline.paid) / total) * 100 : 0}%` }} />
        </div>
      </Card>
      <Card title="Next visits">
        <ul className="grid gap-2.5">
          {t.visits.map((v) => (
            <li key={v.when} className="text-[15px]">
              <span className="font-semibold">{v.customer}</span> <span className="text-[var(--muted)]">· {v.job}</span>
              <span className="block text-[13px] text-[var(--teal)]">{v.when}</span>
            </li>
          ))}
        </ul>
      </Card>
      {t.lastCall && (
        <Card title="Last call">
          <p className="text-[15px]">{t.lastCall.customer ?? "Unknown caller"}</p>
          <p className="text-[14px] text-[var(--muted)]">{t.lastCall.summary}</p>
        </Card>
      )}
    </main>
  );
}

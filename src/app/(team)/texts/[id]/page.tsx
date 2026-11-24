import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCustomerAction } from "@/app/actions";
import { DraftCard, ErrorNote } from "@/components/ui";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";
import { textThread } from "@/team/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Thread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const actor = await requireActor();
  const { deps } = await context();
  const t = await textThread(deps.db, actor, id);
  if (!t.customer) notFound();
  const { error } = await searchParams;
  return (
    <main>
      <Link href="/texts" className="text-[14px] text-[var(--teal)]">‹ Texts</Link>
      <h1 className="mt-2 text-center text-[17px] font-semibold">{t.customer}</h1>
      <ul className="mt-4 grid gap-2">
        {t.messages.map((m, i) => (
          <li key={i} className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-[1.4] ${m.direction === "out" ? "ml-auto bg-[var(--teal)] text-black" : "bg-white/10"}`}>{m.body}</li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3">
        <ErrorNote error={error} />
        {t.draft && <DraftCard draft={{ ...t.draft, customer: null }} canApprove={actor.role === "owner"} back={`/texts/${id}`} />}
      </div>
      {actor.role === "owner" && (
        <details className="mt-10 rounded-xl border border-white/10 p-3 text-[14px]">
          <summary className="cursor-pointer text-[var(--muted)]">Delete this customer&apos;s data</summary>
          <form action={deleteCustomerAction} className="mt-3 grid gap-2">
            <input type="hidden" name="customerId" value={id} />
            <p className="text-[var(--muted)]">Removes {t.customer}, their texts, calls, drafts and jobs everywhere. The audit log keeps a record that it happened, not what was said. This cannot be undone.</p>
            <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" /> I understand</label>
            <button className="rounded-lg border border-red-300/40 py-2 text-red-300">Delete customer data</button>
          </form>
        </details>
      )}
    </main>
  );
}

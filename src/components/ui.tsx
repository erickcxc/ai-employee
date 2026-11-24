import type { ReactNode } from "react";
import { decideAction } from "@/app/actions";

export function Card({ title, children, tone }: { title?: string; children: ReactNode; tone?: "wait" }) {
  return (
    <section className={`rounded-2xl border p-4 ${tone === "wait" ? "border-amber-200/30 bg-amber-200/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
      {title && <h2 className="mb-3 font-mono text-[11px] tracking-[0.14em] text-[var(--muted)] uppercase">{title}</h2>}
      {children}
    </section>
  );
}

export function Tag({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" | "red" | "grey" }) {
  const c = { teal: "bg-[var(--teal)]/15 text-[var(--teal)]", amber: "bg-amber-200/15 text-amber-200", red: "bg-red-400/15 text-red-300", grey: "bg-white/10 text-[var(--muted)]" }[tone];
  return <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${c}`}>{children}</span>;
}

/** A draft waiting for the owner. The owner can edit, send or reject; a team member sees who it waits on. */
export function DraftCard({ draft, canApprove, back }: { draft: { id: string; body: string; customer: string | null; kind?: string; status?: "pending" | "approved" }; canApprove: boolean; back: string }) {
  const briefing = draft.kind === "briefing";
  // Approved but not sent: the send failed. The owner can retry it as approved, without edits.
  const failed = draft.status === "approved";
  return (
    <form action={decideAction} className="rounded-xl border border-amber-200/25 bg-amber-200/[0.05] p-3">
      <p className="font-mono text-[10.5px] tracking-[0.12em] text-amber-200 uppercase">{briefing ? "Morning briefing · to the team" : `Draft by Mike${draft.customer ? ` · to ${draft.customer}` : ""}`}</p>
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="original" value={draft.body} />
      <input type="hidden" name="back" value={back} />
      {canApprove && failed ? (
        <>
          <p className="mt-2 text-[15px] leading-[1.45]">{draft.body}</p>
          <p className="mt-2 text-[13px] text-amber-200">Approved, but the send failed.</p>
          <button name="action" value="approve" className="mt-2 w-full rounded-lg bg-[var(--teal)] py-2 text-[14px] font-semibold text-black">Retry send</button>
        </>
      ) : canApprove ? (
        <>
          <textarea name="body" defaultValue={draft.body} rows={briefing ? 7 : 3} maxLength={briefing ? 2000 : 320} aria-label="Message" className="mt-2 w-full resize-none rounded-lg bg-black/30 p-2 text-[15px] leading-[1.45] outline-none focus:ring-1 focus:ring-[var(--teal)]" />
          <div className="mt-2 flex gap-2">
            <button name="action" value="approve" className="flex-1 rounded-lg bg-[var(--teal)] py-2 text-[14px] font-semibold text-black">Send</button>
            <button name="action" value="reject" className="rounded-lg border border-white/15 px-4 py-2 text-[14px] text-[var(--muted)]">Reject</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[15px] leading-[1.45]">{draft.body}</p>
          <p className="mt-2 text-[13px] text-amber-200">Waiting on the owner&apos;s OK</p>
        </>
      )}
    </form>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  return error ? <p role="alert" className="rounded-lg bg-red-400/10 px-3 py-2 text-[14px] text-red-300">Not sent: {error}</p> : null;
}

"use client";

import { useCall, type Logged } from "@/call/useCall";

const describe = (e: Logged) => {
  switch (e.type) {
    case "tool_call": return { tone: "text-[var(--teal)]", text: `Tool: ${e.name}` };
    case "tool_result": return { tone: e.ok ? "text-[var(--teal)]" : "text-red-300", text: `${e.name} ${e.ok ? "done" : "refused"}` };
    case "row_written": return { tone: "text-white", text: `Row ${e.action === "insert" ? "written" : "updated"}: ${e.table}` };
    case "guardrail": return { tone: "text-amber-200", text: `Guardrail: ${e.detail}` };
  }
};

export default function CallMike({ local }: { local: boolean }) {
  const call = useCall();
  const live = call.status === "live" || call.status === "connecting";
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <section className="rounded-2xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Mike</p>
            <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--teal)] uppercase">{call.status === "live" ? "On the call" : call.status === "connecting" ? "Connecting" : "Brightwater Plumbing"}</p>
          </div>
          {live ? (
            <button onClick={call.hangUp} className="rounded-full bg-red-400/90 px-5 py-2 font-semibold text-black">Hang up</button>
          ) : (
            <button onClick={call.start} disabled={local} className="rounded-full bg-[var(--teal)] px-5 py-2 font-semibold text-black disabled:opacity-40">Call Mike</button>
          )}
        </div>
        {local && <p className="mt-3 text-[14px] text-[var(--muted)]">Local mode has no voice. Set PROVIDERS=live and OPENAI_API_KEY to call Mike.</p>}
        {call.error && <p role="alert" className="mt-3 text-[14px] text-red-300">{call.error}</p>}
        <ul className="mt-4 grid gap-2" aria-live="polite">
          {call.lines.map((l, i) => (
            <li key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] ${l.who === "mike" ? "bg-white/10" : "ml-auto bg-[var(--teal)]/20"}`}>{l.text}</li>
          ))}
        </ul>
        {!call.lines.length && !local && <p className="mt-4 text-[14px] text-[var(--muted)]">Try: &ldquo;Water is coming through my ceiling&rdquo;, or ask to book a visit. Everything you say goes into a sample database that resets.</p>}
      </section>
      <aside className="rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[12px]">
        <p className="mb-3 tracking-[0.14em] text-[var(--muted)] uppercase">Under the hood</p>
        <ol className="grid gap-1.5">
          {call.events.map((e, i) => {
            const d = describe(e);
            return (
              <li key={i} className="grid grid-cols-[52px_1fr] gap-2">
                <span className="text-[var(--muted)]">T+{(e.ms / 1000).toFixed(1)}</span>
                <span className={d.tone}>{d.text}</span>
              </li>
            );
          })}
        </ol>
        {!call.events.length && <p className="text-[var(--muted)]">Tool calls, rows written and guardrails show up here as they happen.</p>}
      </aside>
    </div>
  );
}

import { Tag } from "@/components/ui";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";
import { callList } from "@/team/queries";

const TONE = { customer: "teal", message: "grey", spam: "grey", unclear: "amber" } as const;
const LABEL = { customer: "Lead", message: "Message", spam: "Spam", unclear: "Unclear" } as const;

export default async function Calls() {
  const actor = await requireActor();
  const { deps } = await context();
  const calls = await callList(deps.db, actor);
  return (
    <main>
      <h1 className="text-[28px] font-semibold">Calls</h1>
      <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
        {calls.map((c) => {
          const o = (c.outcome ?? "unclear") as keyof typeof LABEL;
          return (
            <li key={c.id} className="flex items-start justify-between gap-3 py-3.5">
              <span className="min-w-0">
                <span className="block font-semibold">{c.customer ?? "Unknown caller"}</span>
                <span className="block text-[14px] text-[var(--muted)]">{c.summary}</span>
                {c.grade && <span className="mt-1 block text-[12px] text-[var(--muted)]">Graded: {Object.values(c.grade).every(Boolean) ? "rules followed" : "needs a look"}</span>}
              </span>
              {c.urgent ? <Tag tone="red">Urgent</Tag> : <Tag tone={TONE[o]}>{LABEL[o]}</Tag>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

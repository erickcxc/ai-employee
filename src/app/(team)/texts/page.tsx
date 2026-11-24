import Link from "next/link";
import { Tag } from "@/components/ui";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";
import { textThreads } from "@/team/queries";

export default async function Texts() {
  const actor = await requireActor();
  const { deps } = await context();
  const threads = await textThreads(deps.db, actor);
  return (
    <main>
      <h1 className="text-[28px] font-semibold">Texts</h1>
      <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
        {threads.map((t) => (
          <li key={t.customerId}>
            <Link href={`/texts/${t.customerId}`} className="flex items-center justify-between gap-3 py-3.5">
              <span className="min-w-0">
                <span className="block font-semibold">{t.customer}</span>
                <span className="block truncate text-[14px] text-[var(--muted)]">{t.last}</span>
              </span>
              {t.waiting && <Tag tone="amber">Draft</Tag>}
            </Link>
          </li>
        ))}
      </ul>
      {!threads.length && <p className="mt-4 text-[var(--muted)]">No texts yet.</p>}
    </main>
  );
}

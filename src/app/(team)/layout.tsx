import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function TeamLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const { deps } = await context();
  const [who] = await deps.db.as(actor, (tx) => tx.query<{ business: string; person: string }>(`select b.name as business, p.name as person from businesses b, people p where p.id = $1`, [actor.id]));
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-24">
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-[13px] text-[var(--muted)]">{who?.business}</p>
          <p className="text-[15px] font-semibold">{who?.person} · {actor.role === "owner" ? "Owner" : "Team"}</p>
        </div>
        <form action={signOutAction}>
          <button className="text-[13px] text-[var(--muted)] underline-offset-4 hover:underline">Sign out</button>
        </form>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[var(--bg)]/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 text-center text-[14px]">
          <Link href="/today" className="py-3.5">Today</Link>
          <Link href="/texts" className="py-3.5">Texts</Link>
          <Link href="/calls" className="py-3.5">Calls</Link>
        </div>
      </nav>
    </div>
  );
}

import Link from "next/link";
import { context } from "@/server/context";
import CallMike from "./CallMike";

export const dynamic = "force-dynamic";

export default async function CallPage() {
  const { local } = await context();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-[14px] text-[var(--teal)]">‹ Brightwater Plumbing</Link>
      <h1 className="mt-2 text-[28px] font-semibold">Call Mike</h1>
      <p className="mt-1 mb-5 text-[15px] text-[var(--muted)]">He answers for a sample plumbing company. Ask for a visit, report a leak, or try to sell him something.</p>
      <CallMike local={local} />
    </main>
  );
}

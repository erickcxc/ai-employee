import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--teal)] uppercase">Open-source AI employee</p>
        <h1 className="mt-2 text-3xl font-semibold">Brightwater Plumbing</h1>
        <p className="mt-3 text-[16px] leading-[1.55] text-[var(--muted)]">
          A sample business run with Mike, an AI employee. Call him in your browser, then sign in as the owner to approve what he drafted. Every person and number here is made up.
        </p>
      </div>
      <Link href="/call" className="rounded-full bg-[var(--teal)] py-3 text-center text-[15px] font-semibold text-black">Call Mike</Link>
      <Link href="/login" className="rounded-full border border-white/15 py-3 text-center text-[15px]">Team app sign in</Link>
    </main>
  );
}

import { verifyAction } from "@/app/actions";

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="text-2xl font-semibold">Sign in to the team app</h1>
      <form action={verifyAction} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button className="w-full rounded-lg bg-[var(--teal)] py-2.5 font-semibold text-black">Sign in</button>
      </form>
    </main>
  );
}

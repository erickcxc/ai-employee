import { requestLoginAction } from "@/app/actions";
import { context } from "@/server/context";

const ERRORS: Record<string, string> = { expired: "That link expired or was already used. Ask for a new one.", limit: "Too many tries. Wait a few minutes." };

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const { local } = await context();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {sent ? (
        <p className="mt-4 text-[15px] text-[var(--muted)]">If that email has an account, a sign-in link is on its way. It works once, for 15 minutes.</p>
      ) : (
        <form action={requestLoginAction} className="mt-5 grid gap-3">
          <label className="text-[14px] text-[var(--muted)]" htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={local ? "sam@brightwater.example" : ""} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--teal)]" />
          <button className="rounded-lg bg-[var(--teal)] py-2.5 font-semibold text-black">Email me a link</button>
          {local && <p className="text-[13px] text-[var(--muted)]">Local mode: no email is sent, you go straight to the link. Try sam@ (owner) or jordan@ (team).</p>}
        </form>
      )}
      {error && <p role="alert" className="mt-4 text-[14px] text-red-300">{ERRORS[error] ?? "Something went wrong."}</p>}
    </main>
  );
}

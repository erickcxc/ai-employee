"use server";
// Every change the team app makes goes through these actions, as the signed-in person. Next.js checks
// the request's origin on server actions, so another site cannot post them (CSRF).
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { COOKIE, requestLogin, SESSION_MS, signOut, verifyLogin } from "@/auth";
import { decideDraft } from "@/review/approvals";
import { deleteCustomer } from "@/jobs";
import { context } from "@/server/context";
import { requireActor } from "@/server/session";
import { safeBack } from "@/server/back";

const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export async function requestLoginAction(form: FormData) {
  const ctx = await context();
  const email = String(form.get("email") ?? "");
  if (!ctx.limitLogins(`login:${await ip()}`)) redirect("/login?error=limit");
  const before = ctx.providers.email.sent.length;
  await requestLogin(ctx.auth, email);
  // Local mode sends no email: open the link straight away instead.
  if (ctx.local) {
    const mail = ctx.providers.email.sent.slice(before).at(-1);
    const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
    if (link) redirect(new URL(link).pathname + new URL(link).search);
  }
  redirect("/login?sent=1");
}

export async function verifyAction(form: FormData) {
  const ctx = await context();
  const cookie = await verifyLogin(ctx.auth, String(form.get("token") ?? ""));
  if (!cookie) redirect("/login?error=expired");
  (await cookies()).set(COOKIE, cookie, { httpOnly: true, secure: !ctx.local, sameSite: "lax", path: "/", maxAge: SESSION_MS / 1000 });
  redirect("/today");
}

export async function signOutAction() {
  const ctx = await context();
  const jar = await cookies();
  await signOut(ctx.auth, jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
  redirect("/login");
}

export async function decideAction(form: FormData) {
  const actor = await requireActor();
  const ctx = await context();
  const id = String(form.get("id") ?? "");
  const action = form.get("action") === "reject" ? "reject" : "approve";
  const edited = form.get("body");
  const original = String(form.get("original") ?? "");
  const body = typeof edited === "string" && edited.trim() && edited.trim() !== original.trim() ? edited : undefined;
  const back = safeBack(form.get("back"));
  const r = await decideDraft(ctx.approvals, actor, id, { action, body });
  revalidatePath("/today");
  revalidatePath("/texts");
  redirect(r.ok ? back : `${back}?error=${encodeURIComponent(r.reasons.join(", "))}`);
}

export async function deleteCustomerAction(form: FormData) {
  const actor = await requireActor();
  const ctx = await context();
  const id = String(form.get("customerId") ?? "");
  if (form.get("confirm") !== "yes") redirect(`/texts/${id}?error=${encodeURIComponent("tick the box to confirm")}`);
  const job = { ...ctx.approvals, now: ctx.deps.now };
  const r = await deleteCustomer(job, actor, id);
  revalidatePath("/texts");
  revalidatePath("/today");
  redirect(r.ok ? "/texts" : `/texts/${id}?error=${encodeURIComponent(r.reason)}`);
}

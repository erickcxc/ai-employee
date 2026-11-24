// The signed-in person for a page or action. Pages call requireActor(); no session means the login page.
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFromCookie, COOKIE } from "@/auth";
import type { Actor } from "@/db";
import { context } from "./context";

export async function currentActor(): Promise<Actor | null> {
  const ctx = await context();
  return actorFromCookie(ctx.auth, (await cookies()).get(COOKIE)?.value);
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

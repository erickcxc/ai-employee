import { handleSession } from "@/agent/routes";
import { context } from "@/server/context";

export async function POST(request: Request) {
  return handleSession(request, await context());
}

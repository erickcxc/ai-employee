import { handleTool } from "@/agent/routes";
import { context } from "@/server/context";

export async function POST(request: Request) {
  return handleTool(request, await context());
}

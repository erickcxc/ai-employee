import { handleTranscript } from "@/agent/routes";
import { context } from "@/server/context";

export async function POST(request: Request) {
  return handleTranscript(request, await context());
}

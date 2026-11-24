import { handleDailyJobs } from "@/agent/routes";
import { context } from "@/server/context";

// Called once a day by the scheduler (vercel.json), with CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  return handleDailyJobs(request, await context());
}

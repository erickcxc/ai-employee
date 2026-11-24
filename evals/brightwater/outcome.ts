// voice-ci outcome command: runs once per tool call in a voice test, as its own process.
// stdin {"tool", "args"} -> stdout {"kind", "record", "result"}. It runs Mike's real tools against a
// fresh Brightwater database seeded at the suite's date, so openings and bookings are the real logic
// (slot ids are fixed, so an id from check_openings still books in the next process).
// kind picks the closing line; record is what the suite compares for each caller.
import { readFileSync } from "node:fs";
import { openDb } from "../../src/db";
import { fieldKey } from "../../src/db/crypto";
import { BRIGHTWATER, seed } from "../../src/db/seed";
import { runTool, startCall } from "../../src/agent/tools";

export const SUITE_NOW = new Date("2026-11-16T14:30:00Z"); // Monday 9:30 AM in Springfield, as in suite.yaml

const { tool, args = {} } = JSON.parse(readFileSync(0, "utf8") || "{}") as { tool: string; args: Record<string, unknown> };
const key = fieldKey({ PROVIDERS: "fake" });
const db = await openDb();
await db.migrate();
await seed(db, { now: SUITE_NOW, key });
const deps = { db, key, businessId: BRIGHTWATER, now: () => SUITE_NOW };
const callId = await startCall(deps);
const { output } = await runTool(deps, callId, tool, args);
await db.close();

const lastName = (n: unknown) => String(n ?? "").trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") || null;
const houseNumber = (a: unknown) => String(a ?? "").match(/\d+/)?.[0] ?? null;

let out: { kind?: string; record?: unknown; result?: unknown } = { result: output };
if (tool === "finish_call" && output.recorded) {
  const verdict = args.verdict as string;
  out = {
    kind: output.closing,
    record: {
      verdict,
      urgent: verdict === "customer" && args.urgent === true,
      last_name: verdict === "spam" ? null : lastName(args.name),
      house_number: verdict === "customer" ? houseNumber(args.address) : null,
    },
    result: output,
  };
}
process.stdout.write(JSON.stringify(out));

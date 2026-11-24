// The voice suite (voice-ci) calls outcome.ts once per tool call. These tests run it the same way:
// a separate process, JSON in on stdin, JSON out on stdout.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { voiceCiLive } from "../../scripts/export-voice-ci";

const run = async (tool: string, args: unknown) => {
  const p = Bun.spawn(["bun", "evals/brightwater/outcome.ts"], { stdin: new Blob([JSON.stringify({ tool, args })]), stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  expect(await p.exited).toBe(0);
  return JSON.parse(out) as { kind?: string; record?: unknown; result?: Record<string, unknown> };
};

describe("the voice suite's outcome command", () => {
  test("check_openings returns real openings from the seeded calendar", async () => {
    const r = await run("check_openings", {});
    const openings = r.result!.openings as { id: string; label: string }[];
    expect(openings[0]).toEqual({ id: "b7a1e000-0000-4000-8000-000000001000", label: "Tuesday, Nov 17, 9 to 11 AM" });
  });

  test("book_slot books an id from check_openings, across separate processes", async () => {
    const r = await run("book_slot", { slot_id: "b7a1e000-0000-4000-8000-000000001000", name: "Priya Nandakumar", phone: "+12175550101", address: "2207 Linden Court, Springfield", summary: "Replace water heater.", urgent: false });
    expect(r.result).toEqual({ booked: true, when: "Tuesday, Nov 17, 9 to 11 AM" });
  });

  test("finish_call returns the closing kind and the record the suite compares", async () => {
    const r = await run("finish_call", { verdict: "customer", urgent: true, name: "Tom Okafor", phone: "+12175550102", address: "418 Birchwood Avenue, Springfield", summary: "Burst pipe." });
    expect(r.kind).toBe("urgent");
    expect(r.record).toEqual({ verdict: "customer", urgent: true, last_name: "okafor", house_number: "418" });
  });

  test("spam leaves a record with no person in it", async () => {
    const r = await run("finish_call", { verdict: "spam", urgent: false, name: "Chad Rivers", phone: null, address: null, summary: "Selling ads." });
    expect(r).toMatchObject({ kind: "spam", record: { verdict: "spam", urgent: false, last_name: null, house_number: null } });
  });
});

test("the suite's live.json is exactly Mike's real session (regenerate with bun scripts/export-voice-ci.ts)", () => {
  expect(JSON.parse(readFileSync("evals/brightwater/live.json", "utf8"))).toEqual(voiceCiLive());
});

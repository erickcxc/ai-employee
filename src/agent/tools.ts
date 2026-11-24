// Mike's tools, run on the server as the agent role. The model only proposes a call; every check that
// matters happens here: the arguments' shape, the call is real and still open, the slot is still
// free, one booking and one outcome per call. The caller's words are stored as data and screened for
// instructions (flagged, never obeyed). Each result returns panel events, so a viewer can watch the
// system work: tool calls, rows written, guardrails fired.
import { z } from "zod";
import type { Db, Tx } from "@/db";
import { encryptField, lookupHash } from "@/db/crypto";
import { MAX_CALL_MS } from "./limits";

export type ToolDeps = { db: Db; key: Buffer; businessId: string; now: () => Date };
export type PanelEvent =
  | { type: "tool_call"; name: string; at: string }
  | { type: "tool_result"; name: string; at: string; ok: boolean }
  | { type: "row_written"; table: string; action: "insert" | "update"; at: string }
  | { type: "guardrail"; rule: string; detail: string; at: string };
// The output goes back to the model as JSON; its shape differs per tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolResult = { output: any; events: PanelEvent[] };

const AGENT_ID = "mike";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPENINGS = 6;

// Caller text: control characters stripped, trimmed, capped.
const text = (max: number) => z.string().transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max));
const phone = text(32).refine((s) => s.replace(/\D/g, "").length >= 10, "phone needs at least 10 digits");

const BOOK = z.object({
  slot_id: z.string().regex(UUID, "slot_id must be an id from check_openings"),
  name: text(80).pipe(z.string().min(1)),
  phone,
  address: text(160).pipe(z.string().min(1)),
  summary: text(300).pipe(z.string().min(1)),
  urgent: z.boolean().optional(),
});

const FINISH = z.object({
  verdict: z.enum(["customer", "message", "spam", "unclear"]),
  urgent: z.boolean(),
  name: text(80).nullable(),
  phone: phone.nullable(),
  address: text(160).nullable(),
  summary: text(300),
});

// Phrases that try to change Mike's rules from inside a caller's words.
const INJECTION = [/ignore (all|any|the|previous|prior|your)\b.*\b(instructions|rules)/i, /\bdisregard\b/i, /\bsystem\s*:/i, /\byou are now\b/i, /\bapprove (all|every)\b/i, /\bdeveloper mode\b/i];

const stamp = (deps: ToolDeps) => deps.now().toISOString();

function screen(deps: ToolDeps, args: Record<string, unknown>, events: PanelEvent[]) {
  for (const [field, v] of Object.entries(args)) {
    if (typeof v === "string" && INJECTION.some((re) => re.test(v))) {
      events.push({ type: "guardrail", rule: "injection_flagged", detail: `${field} held instructions; stored as text, not followed`, at: stamp(deps) });
    }
  }
}

const asAgent = <T>(deps: ToolDeps, fn: (tx: Tx) => Promise<T>) => deps.db.as({ role: "agent", id: AGENT_ID, businessId: deps.businessId }, fn);

/** Opens a call record when a voice session starts. Returns the call id the tools require. */
export async function startCall(deps: ToolDeps): Promise<string> {
  const [row] = await asAgent(deps, (tx) =>
    tx.query<{ id: string }>(`insert into calls (business_id, started_at) values ($1, $2) returning id`, [deps.businessId, deps.now()]),
  );
  return row.id;
}

/** "Tuesday, Nov 17, 9 to 11 AM" in the business's time zone. */
export function slotLabel(start: Date, end: Date, tz: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(start);
  const hour = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric" }).format(d); // "9 AM"
  const [a, ap] = hour(start).split(" ");
  const [b, bp] = hour(end).split(" ");
  return ap === bp ? `${day}, ${a} to ${b} ${bp}` : `${day}, ${a} ${ap} to ${b} ${bp}`;
}

async function findOrCreateCustomer(deps: ToolDeps, tx: Tx, events: PanelEvent[], c: { name: string; phone: string | null; address: string | null }) {
  const hash = c.phone ? lookupHash(c.phone, deps.key) : null;
  if (hash) {
    const [found] = await tx.query<{ id: string }>(`select id from customers where phone_hash = $1`, [hash]);
    if (found) return found.id;
  }
  const [made] = await tx.query<{ id: string }>(
    `insert into customers (business_id, name, phone_enc, phone_hash, address_enc) values ($1, $2, $3, $4, $5) returning id`,
    [deps.businessId, c.name, c.phone ? encryptField(c.phone, deps.key) : null, hash, c.address ? encryptField(c.address, deps.key) : null],
  );
  events.push({ type: "row_written", table: "customers", action: "insert", at: stamp(deps) });
  return made.id;
}

type CallRow = { id: string; outcome: string | null; booked_job_id: string | null; started_at: Date };

/** The business's own time zone; every label Mike says is in it. */
async function timezone(tx: Tx): Promise<string> {
  const [b] = await tx.query<{ timezone: string }>(`select timezone from businesses`);
  return b.timezone;
}

async function checkOpenings(deps: ToolDeps, tx: Tx) {
  const tz = await timezone(tx);
  const slots = await tx.query<{ id: string; starts_at: Date; ends_at: Date }>(
    `select id, starts_at, ends_at from slots where status = 'open' and starts_at > $1 order by starts_at limit ${MAX_OPENINGS}`,
    [deps.now()],
  );
  return { openings: slots.map((s) => ({ id: s.id, label: slotLabel(new Date(s.starts_at), new Date(s.ends_at), tz) })) };
}

async function bookSlot(deps: ToolDeps, tx: Tx, call: CallRow, raw: unknown, events: PanelEvent[]) {
  const a = BOOK.parse(raw);
  if (call.booked_job_id) return { booked: false, reason: "This call already booked a visit." };
  const [slot] = await tx.query<{ id: string; starts_at: Date; ends_at: Date }>(
    `update slots set status = 'booked' where id = $1 and status = 'open' and starts_at > $2 returning id, starts_at, ends_at`,
    [a.slot_id, deps.now()],
  );
  if (!slot) return { booked: false, reason: "That time was just taken. Offer another opening." };
  const customerId = await findOrCreateCustomer(deps, tx, events, a);
  const [job] = await tx.query<{ id: string }>(
    `insert into jobs (business_id, customer_id, title, status, urgent) values ($1, $2, $3, 'scheduled', $4) returning id`,
    [deps.businessId, customerId, a.summary, a.urgent ?? false],
  );
  events.push({ type: "row_written", table: "jobs", action: "insert", at: stamp(deps) });
  await tx.query(`update slots set job_id = $1 where id = $2`, [job.id, slot.id]);
  events.push({ type: "row_written", table: "slots", action: "update", at: stamp(deps) });
  await tx.query(`update calls set booked_job_id = $1, customer_id = $2 where id = $3`, [job.id, customerId, call.id]);
  events.push({ type: "row_written", table: "calls", action: "update", at: stamp(deps) });
  return { booked: true, when: slotLabel(new Date(slot.starts_at), new Date(slot.ends_at), await timezone(tx)) };
}

async function finishCall(deps: ToolDeps, tx: Tx, call: CallRow, raw: unknown, events: PanelEvent[]) {
  const a = FINISH.parse(raw);
  if (call.outcome) return { recorded: false, reason: "This call is already recorded." };
  let customerId: string | null = null;
  if (a.verdict !== "spam" && (a.phone || a.name)) {
    customerId = await findOrCreateCustomer(deps, tx, events, { name: a.name || "Unknown caller", phone: a.phone, address: a.address });
  }
  if (a.verdict === "customer" && customerId && !call.booked_job_id) {
    await tx.query(`insert into jobs (business_id, customer_id, title, status, urgent) values ($1, $2, $3, 'lead', $4)`, [deps.businessId, customerId, a.summary || "New lead", a.urgent]);
    events.push({ type: "row_written", table: "jobs", action: "insert", at: stamp(deps) });
  }
  await tx.query(`update calls set outcome = $1, urgent = $2, summary = $3, customer_id = coalesce(customer_id, $4), ended_at = $5 where id = $6`, [
    a.verdict, a.verdict === "customer" && a.urgent, a.summary, customerId, deps.now(), call.id,
  ]);
  events.push({ type: "row_written", table: "calls", action: "update", at: stamp(deps) });
  const closing = a.verdict === "spam" ? "spam" : a.verdict === "customer" ? (call.booked_job_id ? "booked" : a.urgent ? "urgent" : "job") : "message";
  return { recorded: true, closing };
}

export async function runTool(deps: ToolDeps, callId: string, name: string, args: unknown): Promise<ToolResult> {
  const events: PanelEvent[] = [{ type: "tool_call", name, at: stamp(deps) }];
  const done = (output: Record<string, unknown>, ok = !("error" in output)): ToolResult => {
    events.push({ type: "tool_result", name, at: stamp(deps), ok });
    return { output, events };
  };
  if (!["check_openings", "book_slot", "finish_call"].includes(name)) return done({ error: "Unknown tool" });
  if (!UUID.test(callId)) return done({ error: "Unknown call" });
  if (args && typeof args === "object") screen(deps, args as Record<string, unknown>, events);

  try {
    const output = await asAgent(deps, async (tx) => {
      // Locked for the transaction, so parallel tool calls on one call run one after another.
      const [call] = await tx.query<CallRow>(`select id, outcome, booked_job_id, started_at from calls where id = $1 for update`, [callId]);
      if (!call) return { error: "Unknown call" };
      // A minute of grace past the cap, so a goodbye in flight can still be recorded.
      if (deps.now().getTime() - new Date(call.started_at).getTime() > MAX_CALL_MS + 60_000) {
        events.push({ type: "guardrail", rule: "call_time_cap", detail: "call ran past its time cap; tools refused", at: stamp(deps) });
        return { error: "Call time is over" };
      }
      if (call.outcome && name !== "finish_call") return { error: "This call is already recorded." };
      if (name === "check_openings") return checkOpenings(deps, tx);
      if (name === "book_slot") return bookSlot(deps, tx, call, args, events);
      return finishCall(deps, tx, call, args, events);
    });
    return done(output);
  } catch (e) {
    if (e instanceof z.ZodError) return done({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    throw e;
  }
}

// Brightwater Plumbing: the synthetic sample business. One licensed plumber (Sam), one helper
// (Jordan), a book of past and open jobs, a calendar that is busy with gaps, recent calls and one
// reply waiting for Sam's tap. Every person, number, email and street is invented: numbers are in the
// 555-0100 to 555-0199 range reserved for fiction, emails use the .example domain, and
// assertSynthetic() fails the seed if anything drifts from that.
import { emailHash, encryptField, lookupHash } from "./crypto";
import type { Db } from "./index";

export const BRIGHTWATER = "b7a1e000-0000-4000-8000-000000000001";
const id = (n: number) => `b7a1e000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Customer = { id: string; name: string; phone: string; email?: string; address: string };
type Job = { id: string; customer: string; title: string; status: "lead" | "scheduled" | "done" | "paid" | "lost"; urgent?: boolean; notes?: string; slot?: [day: number, hour: number] };
type Call = { customer?: string; daysAgo: number; outcome: "customer" | "message" | "spam" | "unclear"; urgent?: boolean; summary: string };

const c = (n: number, name: string, ext: string, address: string, email?: string): Customer => ({ id: id(100 + n), name, phone: `+1217555${ext}`, address, email });

export const SEED = {
  business: { id: BRIGHTWATER, name: "Brightwater Plumbing", timezone: "America/New_York" },
  owner: { id: id(10), name: "Sam", email: "sam@brightwater.example" },
  team: [{ id: id(11), name: "Jordan", email: "jordan@brightwater.example" }],
  customers: [
    c(1, "Priya Nandakumar", "0101", "2207 Linden Court, Springfield", "priya.n@mail.example"),
    c(2, "Tom Okafor", "0102", "418 Birchwood Avenue, Springfield"),
    c(3, "Linda Reyes", "0103", "95 Quarry Hill Road, Springfield", "linda.reyes@mail.example"),
    c(4, "Dana Cole", "0104", "1630 Marlow Street, Springfield", "dana.cole@mail.example"),
    c(5, "Marcus Bell", "0105", "72 Fenwick Lane, Springfield"),
    c(6, "Elena Ruiz", "0106", "3310 Orchard Bend, Springfield", "elena.ruiz@mail.example"),
    c(7, "Greg Whitfield", "0107", "509 Tanager Drive, Springfield"),
    c(8, "Aisha Grant", "0108", "2741 Copperleaf Way, Springfield", "aisha.grant@mail.example"),
    c(9, "Walt Brennan", "0109", "86 Millrace Court, Springfield"),
    c(10, "Nora Kim", "0110", "1205 Heron Pond Road, Springfield", "nora.kim@mail.example"),
    c(11, "Victor Hale", "0111", "640 Stonegate Terrace, Springfield"),
  ],
  jobs: [
    { id: id(201), customer: "Linda Reyes", title: "New kitchen faucet", status: "paid" },
    { id: id(202), customer: "Tom Okafor", title: "Burst pipe, kitchen ceiling", status: "lead", urgent: true, notes: "Water through the kitchen ceiling. Main valve shut." },
    { id: id(203), customer: "Priya Nandakumar", title: "Replace water heater", status: "lead", notes: "Heats slowly. About 15 years old." },
    { id: id(204), customer: "Dana Cole", title: "Water heater check and quote", status: "scheduled", slot: [3, 9] },
    { id: id(205), customer: "Marcus Bell", title: "Sump pump replacement", status: "scheduled", slot: [2, 13] },
    { id: id(206), customer: "Elena Ruiz", title: "Leaking shower valve", status: "done" },
    { id: id(207), customer: "Greg Whitfield", title: "Main line camera inspection", status: "lead" },
    { id: id(208), customer: "Aisha Grant", title: "Garbage disposal install", status: "paid" },
    { id: id(209), customer: "Walt Brennan", title: "Frozen pipe repair", status: "lost", notes: "Went with another plumber." },
    { id: id(210), customer: "Nora Kim", title: "Toilet running nonstop", status: "scheduled", slot: [4, 11] },
  ] satisfies Job[],
  calls: [
    { customer: "Priya Nandakumar", daysAgo: 0, outcome: "customer", summary: "Wants a quote to replace an old water heater." },
    { customer: "Tom Okafor", daysAgo: 0, outcome: "customer", urgent: true, summary: "Burst pipe, water through the kitchen ceiling." },
    { daysAgo: 0, outcome: "spam", summary: "Sales pitch for a listings service. Turned away." },
    { customer: "Linda Reyes", daysAgo: 1, outcome: "message", summary: "Question about last week's invoice." },
    { customer: "Dana Cole", daysAgo: 2, outcome: "customer", summary: "Water heater making noise, wants it looked at this week." },
    { customer: "Greg Whitfield", daysAgo: 3, outcome: "customer", summary: "Slow drains on the main floor, asked about a camera inspection." },
  ] satisfies Call[],
  messages: [
    { customer: "Dana Cole", direction: "in" as const, body: "Can someone look at our water heater this week?", minutesAgo: 95 },
    { customer: "Dana Cole", direction: "out" as const, body: "Yes, Thursday morning works. 9 to 11?", minutesAgo: 80 },
    { customer: "Dana Cole", direction: "in" as const, body: "Great. Quote then too?", minutesAgo: 70 },
  ],
  draft: { customer: "Dana Cole", body: "Yes, a written quote on the spot. See you Thursday!" },
};

/** Throws if any value in the seed could belong to a real person. */
export function assertSynthetic(seed: typeof SEED) {
  const people = [...seed.customers, seed.owner, ...seed.team];
  for (const p of seed.customers) {
    const digits = p.phone.replace(/\D/g, "");
    if (!/^1\d{3}55501\d{2}$/.test(digits)) throw new Error(`phone outside the fictional 555-0100 to 555-0199 range: ${p.name}`);
    if (!p.address.endsWith(", Springfield")) throw new Error(`address outside the sample town: ${p.name}`);
  }
  for (const p of people) {
    if ("email" in p && p.email && !p.email.endsWith(".example")) throw new Error(`email not on the reserved .example domain: ${p.name}`);
  }
}

/** Local wall-clock time in the business's zone, as a Date. */
function localTime(base: Date, dayOffset: number, hour: number, tz: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base).map((p) => [p.type, p.value]),
  );
  const guess = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + dayOffset, hour));
  const asLocal = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime()));
}

const WINDOWS = [9, 11, 13, 15]; // two-hour visits

export async function seed(db: Db, { now = new Date(), key }: { now?: Date; key: Buffer }) {
  assertSynthetic(SEED);
  const q = db.admin.query;
  const tz = SEED.business.timezone;
  const enc = (v?: string) => (v ? encryptField(v, key) : null);

  await q(`insert into businesses (id, name, timezone) values ($1, $2, $3)`, [BRIGHTWATER, SEED.business.name, tz]);
  const person = `insert into people (id, business_id, name, role, email_enc, email_hash) values ($1, $2, $3, $4, $5, $6)`;
  await q(person, [SEED.owner.id, BRIGHTWATER, SEED.owner.name, "owner", enc(SEED.owner.email), emailHash(SEED.owner.email, key)]);
  for (const t of SEED.team) await q(person, [t.id, BRIGHTWATER, t.name, "team", enc(t.email), emailHash(t.email, key)]);

  const cid = new Map<string, string>();
  for (const p of SEED.customers) {
    cid.set(p.name, p.id);
    await q(`insert into customers (id, business_id, name, phone_enc, phone_hash, email_enc, address_enc) values ($1, $2, $3, $4, $5, $6, $7)`, [
      p.id, BRIGHTWATER, p.name, enc(p.phone), lookupHash(p.phone, key), enc(p.email), enc(p.address),
    ]);
  }

  const booked = new Map<string, string>();
  for (const j of SEED.jobs as Job[]) {
    await q(`insert into jobs (id, business_id, customer_id, title, status, urgent, notes) values ($1, $2, $3, $4, $5, $6, $7)`, [
      j.id, BRIGHTWATER, cid.get(j.customer), j.title, j.status, j.urgent ?? false, j.notes ?? null,
    ]);
    if (j.slot) booked.set(`${j.slot[0]}:${j.slot[1]}`, j.id);
  }

  // The next seven days of openings, weekdays only, with the scheduled jobs on them. Slot ids are fixed
  // (b7a1e000-...-000000001000 onward), so separate processes seeded at the same moment agree on them.
  let slotN = 1000;
  for (let d = 1; d <= 7; d++) {
    const day = localTime(now, d, 12, tz);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(day);
    if (weekday === "Sat" || weekday === "Sun") continue;
    for (const h of WINDOWS) {
      const job = booked.get(`${d}:${h}`);
      await q(`insert into slots (id, business_id, starts_at, ends_at, status, job_id) values ($1, $2, $3, $4, $5, $6)`, [
        id(slotN++), BRIGHTWATER, localTime(now, d, h, tz), localTime(now, d, h + 2, tz), job ? "booked" : "open", job ?? null,
      ]);
    }
  }

  for (const [i, call] of (SEED.calls as Call[]).entries()) {
    const start = new Date(now.getTime() - call.daysAgo * 86_400_000 - (i + 1) * 47 * 60_000);
    await q(`insert into calls (business_id, customer_id, started_at, ended_at, outcome, urgent, summary, grade) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
      BRIGHTWATER, call.customer ? cid.get(call.customer) : null, start, new Date(start.getTime() + 150_000), call.outcome, call.urgent ?? false, call.summary,
      { details_complete: true, urgency_right: true, rules_followed: true },
    ]);
  }

  for (const m of SEED.messages) {
    await q(`insert into messages (business_id, customer_id, direction, body, at) values ($1, $2, $3, $4, $5)`, [
      BRIGHTWATER, cid.get(m.customer), m.direction, m.body, new Date(now.getTime() - m.minutesAgo * 60_000),
    ]);
  }

  await q(`insert into drafts (business_id, customer_id, kind, body, status, created_by, review) values ($1, $2, 'text', $3, 'pending', 'agent:mike', $4)`, [
    BRIGHTWATER, cid.get(SEED.draft.customer), SEED.draft.body, { pass: true, reasons: [] },
  ]);
}

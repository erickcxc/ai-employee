// Nothing goes out without a person's tap. Mike's drafts are reviewed, then wait as pending. The owner
// approves (optionally editing), rejects, or leaves them. Approving a text sends it to the customer and
// logs the message; approving the morning briefing emails it to the team. Every step lands in the audit
// log under the actor who took it.
import type { Actor, Db } from "@/db";
import { decryptField } from "@/db/crypto";
import type { Providers } from "@/providers";
import { checkRules } from "./rules";
import { reviewText, type Review } from "./review";

export type ApprovalCtx = { db: Db; key: Buffer; businessId: string; providers: Providers };
type Decision = { action: "approve" | "reject"; body?: string };
type DecideResult = { ok: true; status: "sent" | "rejected" } | { ok: false; reasons: string[] };
type Outbox = { kind: "text"; to: string; customerId: string; body: string } | { kind: "briefing"; to: string[]; body: string };

export async function createDraft(
  ctx: ApprovalCtx,
  d: { customerId: string; body: string; createdBy?: string },
): Promise<{ drafted: boolean; id?: string; reasons?: string[]; review: Review }> {
  const body = d.body.trim();
  const review = await reviewText(body, ctx.providers.llm);
  if (!review.pass) return { drafted: false, reasons: review.reasons, review };
  const by = d.createdBy ?? "mike";
  const [row] = await ctx.db.as({ role: "agent", id: by, businessId: ctx.businessId }, (tx) =>
    tx.query<{ id: string }>(
      `insert into drafts (business_id, customer_id, kind, body, status, created_by, review) values ($1, $2, 'text', $3, 'pending', $4, $5) returning id`,
      [ctx.businessId, d.customerId, body, `agent:${by}`, review],
    ),
  );
  return { drafted: true, id: row.id, review };
}

export async function decideDraft(ctx: ApprovalCtx, actor: Actor, id: string, decision: Decision): Promise<DecideResult> {
  if (actor.role !== "owner") return { ok: false, reasons: ["only the owner can approve"] };

  const step1 = await ctx.db.as(actor, async (tx) => {
    const [d] = await tx.query<{ status: string; kind: string; body: string; phone_enc: string | null; customer_id: string }>(
      `select d.status, d.kind, d.body, c.phone_enc, d.customer_id from drafts d left join customers c on c.id = d.customer_id where d.id = $1 for update of d`,
      [id],
    );
    if (!d) return { ok: false as const, reasons: ["draft not found"] };
    // "approved" means the owner said yes but the send failed: approving again retries it as it was.
    const retry = d.status === "approved" && decision.action === "approve" && decision.body === undefined;
    if (d.status !== "pending" && !retry) return { ok: false as const, reasons: ["already decided"] };

    if (decision.action === "reject") {
      await tx.query(`update drafts set status = 'rejected', decided_by = $2, decided_at = now() where id = $1`, [id, actor.id]);
      return { ok: true as const, status: "rejected" as const };
    }

    const body = decision.body?.trim() ?? d.body;
    if (decision.body !== undefined) {
      // Briefings go to the team by email, so the text-length rule does not apply to them.
      const reasons = checkRules(body).reasons.filter((r) => !(d.kind === "briefing" && r === "too long"));
      if (reasons.length) return { ok: false as const, reasons };
    }

    let out: Outbox;
    if (d.kind === "briefing") {
      const team = await tx.query<{ email_enc: string | null }>(`select email_enc from people`);
      out = { kind: "briefing", to: team.flatMap((p) => (p.email_enc ? [decryptField(p.email_enc, ctx.key)] : [])), body };
    } else {
      if (!d.phone_enc) return { ok: false as const, reasons: ["no phone on file"] };
      out = { kind: "text", to: decryptField(d.phone_enc, ctx.key), customerId: d.customer_id, body };
    }
    if (!retry) await tx.query(`update drafts set status = 'approved', body = $2, decided_by = $3, decided_at = now() where id = $1`, [id, body, actor.id]);
    return { ok: true as const, status: "approved" as const, out };
  });

  if (!step1.ok || step1.status === "rejected") return step1;
  const out = step1.out;

  // Sending happens after the approval commits, so a send failure leaves an approved draft to retry,
  // never a sent message without a record.
  try {
    if (out.kind === "text") await ctx.providers.sms.send({ to: out.to, body: out.body });
    else for (const to of out.to) await ctx.providers.email.send({ to, subject: "Today's briefing", text: out.body });
  } catch {
    return { ok: false, reasons: ["send failed; tap approve again to retry"] };
  }
  await ctx.db.as(actor, async (tx) => {
    await tx.query(`update drafts set status = 'sent' where id = $1`, [id]);
    if (out.kind === "text") await tx.query(`insert into messages (business_id, customer_id, direction, body) values ($1, $2, 'out', $3)`, [actor.businessId, out.customerId, out.body]);
  });
  return { ok: true, status: "sent" };
}

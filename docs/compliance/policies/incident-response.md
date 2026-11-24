# Incident response policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 CC7.3 to CC7.5.

**Company:** [Company] · **Incident lead:** [name, phone] · **Backup:** [name, phone] · **Approved:** [date]

## What counts as an incident

- Customer data seen by someone who should not see it, or possibly seen.
- A key or secret exposed.
- The app or the database unavailable, damaged or lost.
- Mike doing something harmful on a call or in a draft: a leak, a promise, an abusive reply, a pattern of wrong bookings.
- A vulnerability report that turns out to be real (`SECURITY.md`).

## Steps

1. **Report.** Anyone who sees a possible incident tells the incident lead at once. Better a false alarm than a late one.
2. **Triage** (within [1 hour]). Severity: **High** if customer data or a key is involved, or the service is down; **Low** otherwise. Open an incident record: what, when, who found it.
3. **Contain.** Examples:
   - Key exposed: rotate it now, then check the provider's logs for its use.
   - Data exposure: revoke sessions, remove the access path, keep the evidence.
   - Mike misbehaving: take the call page offline (remove `OPENAI_API_KEY` so no call can start) and pause the daily job.
   - Database damage: follow `docs/compliance/backup-restore.md`, "Real recovery".
4. **Investigate.** The audit log (`audit_log`) shows who did what, and its hash chain shows whether it was tampered with. Check it against the latest audit head the daily job logged to the host (`verifyAuditChain` in `src/db/index.ts`), so a cut or rewrite after that point is caught too. Host and provider logs fill in the rest.
5. **Notify.** If customer data was exposed, the owner decides with [legal contact] who must be told and by when. Laws on breach notice vary by state and country; [fill in the ones that apply].
6. **Recover.** Fix the cause, confirm the fix with a test where possible, bring the service back.
7. **Review** (within [5 business days]). A short write-up: timeline, cause, what stopped it, what changes. New risks go into `docs/compliance/risks.md` with a test.

## Practice

Run a tabletop exercise once a year: walk through one scenario above on paper and record it.

## Evidence

- Incident records and reviews.
- The yearly tabletop record.

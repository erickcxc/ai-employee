# Data retention and deletion policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 C1.1, C1.2.

**Company:** [Company] · **Policy owner:** [name, role] · **Approved:** [date] · **Next review:** [date + 1 year]

## Purpose

Keep customer data only as long as it is useful, and delete it for good when it is not.

## Rules

1. **What is kept, and for how long,** is in `docs/compliance/data-inventory.md`. The periods are set in one place in code (`src/compliance/retention.ts`) and enforced every day by the retention job (`src/jobs/index.ts`, run from `src/app/api/jobs/daily/route.ts`). A test keeps the inventory and the code in step.
2. **Call transcripts** are the most personal data and are cleared after the period in `src/compliance/retention.ts`. The call's outcome and summary stay as the business record.
3. **Sign-in links and ended sessions** are removed on schedule.
4. **A customer's request to be deleted** is done by the owner in the team app, within [30 days] of the request. It removes the customer and everything about them. The audit log keeps that a deletion happened, not what was deleted.
5. **The audit log** is kept for [at least one year] and is never edited. To prune it after that, export it, verify its hash chain, archive the export and record who did it.
6. **Backups** expire on their own schedule (`docs/compliance/backup-restore.md`). A deleted customer can still be in a backup until that backup expires; a restore must re-apply deletions made after the backup was taken.
7. **Changing a period** is a code change (`docs/compliance/policies/change-management.md`): edit `src/compliance/retention.ts` and the inventory together.

## Evidence

- The retention job's daily results (counts cleared and removed).
- Deletion requests with the date received and the date done.

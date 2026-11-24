# Backup and recovery policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 A1.2, A1.3, CC9.1.

**Company:** [Company] · **Policy owner:** [name, role] · **Approved:** [date] · **Next review:** [date + 1 year]

## Targets

- **Recovery point (how much data we can lose):** [1 hour] with point-in-time recovery; 24 hours if the host account itself is lost.
- **Recovery time (how long we can be down):** [4 hours].

## Rules

1. **Two layers of backup:** the host's point-in-time recovery, kept [7 days] or more, and a nightly logical dump kept [30 days] in separate, encrypted storage under a different account.
2. **The field key** (`FIELD_KEY`) is backed up separately from the data, where only [the owner] can reach it. Without it the restored contact details cannot be read.
3. **Restores are tested.** The restore test runs on every change (`src/compliance/backup.test.ts`). A restore drill on real backups runs every [quarter] and after any schema change, following `docs/compliance/backup-restore.md`, and is recorded.
4. **Failed drill:** treat it as an incident (`docs/compliance/policies/incident-response.md`) until a drill passes.

## Evidence

- Host backup settings.
- Nightly dump logs.
- Restore drill records, each with the output of `scripts/verify-restore.ts`.

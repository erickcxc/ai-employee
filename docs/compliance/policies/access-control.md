# Access control policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 CC1, CC6.1 to CC6.3.

**Company:** [Company] · **Policy owner:** [name, role] · **Approved:** [date] · **Next review:** [date + 1 year]

## Purpose

Only the right people and systems reach customer data, with the least access their work needs.

## Rules

1. **Roles in the app.** The app has three roles, enforced by the database (`db/migrations/0001_init.sql`):
   - **Owner:** everything in their business; the only role that approves what a customer sees or deletes customer data.
   - **Team:** reads the work, updates jobs and the calendar; approves nothing.
   - **Agent (Mike):** reads what his tools need, writes leads, calls and pending drafts; deletes nothing.
2. **Database connections.** The app connects with a login role that only joins `app_runtime` (`db/migrations/0004_runtime_roles.sql`). It has no rights of its own: every query switches into one of the roles above, the sign-in role or the scheduled-job role, so row-level security always applies. The admin role is used for migrations only.
3. **Sign-in.** One-time email links and server-side sessions that end after 12 hours (`src/auth/index.ts`). Shared accounts are not allowed: each person signs in as themselves.
4. **Admin access** (database admin role, host console, code host, model provider console) is limited to [names]. Every admin account uses multi-factor authentication.
5. **Joiners.** Access is granted by the owner when someone starts, at the lowest role that fits.
6. **Leavers.** Access is removed the day someone leaves: their app account, admin accounts, and any key they could have seen is rotated.
7. **Access review.** Every [quarter] the policy owner lists everyone with app or admin access, confirms each one is still needed, removes the rest and keeps the list as the record.
8. **Secrets.** Keys live in the host's secret store, never in code, chat or email. `.env.example` lists names only. Secret scanning runs on every commit (`.github/workflows/ci.yml`).
9. **Encryption.** Customer contact details are encrypted by the app (`src/db/crypto.ts`) and the database is encrypted at rest by its host. All traffic is HTTPS.

## Evidence

- The controls and tests in `docs/compliance/controls.md`, section CC6.
- Quarterly access review lists.
- Host and code host settings showing multi-factor authentication required.

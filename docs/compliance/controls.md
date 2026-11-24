# Controls matrix

Each row maps a SOC 2 Trust Services Criterion to the control in this repo, the code that implements
it and the test that proves it. Every file and test named here is checked by
`src/compliance/docs.test.ts`: rename one and CI fails until this page is updated.

**Owner** says who carries the control:
- **Code**: built and tested here. A company running this repo inherits it.
- **Company**: a process the company runs. This repo gives a policy template in `docs/compliance/policies/` and, where it can, the evidence.
- **Host**: the cloud provider or database host. Listed in `docs/compliance/subprocessors.md`.

In scope: **Security** (common criteria CC1 to CC9), **Availability** (A1.2, A1.3), **Confidentiality** (C1) and **Processing Integrity** (PI1) for the AI's outputs. Privacy (P series) is out of scope for this repo, though the retention and deletion controls below support it.

## CC1 to CC5: control environment, communication, risk, monitoring, control activities

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| CC1.1 to CC1.5 | Code of conduct, roles, accountability for controls | Company | `docs/compliance/policies/access-control.md` | Company adopts and signs the policies |
| CC2.2, CC2.3 | Security contact and how to report a vulnerability | Company + Code | `SECURITY.md` | Published in the repo |
| CC3.1 to CC3.4 | AI risk register: each risk with its mitigation and test | Code | `docs/compliance/risks.md` | Every test it cites runs in CI |
| CC4.1 | Controls are tested on every change, not once a year | Code | `.github/workflows/ci.yml` | CI runs the full suite on every pull request |
| CC4.1 | The evidence cannot drift from the code | Code | `src/compliance/docs.test.ts` | `src/compliance/docs.test.ts` "every test they cite exists, by file and exact name" |
| CC5.2, CC5.3 | Controls written as code and policy, not tribal knowledge | Code + Company | `docs/compliance/` | This page |

## CC6: logical access

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| CC6.1 | Every table has row-level security, forced so even the table owner obeys it | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "every table has row-level security on and forced, so not even the table owner skips it" |
| CC6.1 | One business never sees another's data | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "a business never sees another business's rows" |
| CC6.1 | Every app query runs as a least-privilege role scoped to one business | Code | `src/db/index.ts` | `src/team/queries.test.ts` "a team member sees the same day" |
| CC6.1 | The app's login has no rights of its own; it can only switch into the app roles | Code | `db/migrations/0004_runtime_roles.sql` | `src/db/roles.test.ts` "the app's login joins app_runtime, which can switch into each app role and has no rights of its own" |
| CC6.1 | Scheduled jobs run as their own role, which cannot read customer data | Code | `db/migrations/0004_runtime_roles.sql` | `src/db/roles.test.ts` "scheduled jobs run as app_system, which can clear old data but cannot read customers" |
| CC6.1 | Fake services never run against a real database, so the local sign-in shortcut and dev key never reach a deployment | Code | `src/server/mode.ts` | `src/server/mode.test.ts` "fake services against a real database refuse to start, so a deployment never runs with the shortcut or the dev key" and `src/server/mode.test.ts` "the sign-in shortcut is for a local machine only: fake services, no real database, not a production build" |
| CC6.1 | A caller cannot reach another business's calendar, even with an exact id | Code | `src/agent/tools.ts` | `src/agent/redteam.test.ts` "another business's opening cannot be booked, even with its exact id" |
| CC6.1 | Customer contact details encrypted at rest (AES-256-GCM) | Code | `src/db/crypto.ts` | `src/db/crypto.test.ts` "round-trips, and the stored form never contains the plain value" |
| CC6.1 | Encrypted values cannot be altered or read with the wrong key | Code | `src/db/crypto.ts` | `src/db/crypto.test.ts` "a tampered value fails instead of decrypting to garbage" and `src/db/crypto.test.ts` "the wrong key fails" |
| CC6.1 | Lookups by phone use a keyed hash, never the plain number | Code | `src/db/crypto.ts` | `src/db/crypto.test.ts` "phone lookups match however the number is written, without storing it" |
| CC6.1 | Live mode requires its own encryption key; the public dev key is for local fake mode only | Code | `src/db/crypto.ts` | `src/db/crypto.test.ts` "live mode requires a 32-byte key; local fake mode uses a fixed dev key" |
| CC6.2 | Sign-in by one-time email link; unknown emails get the same answer | Code | `src/auth/index.ts` | `src/auth/auth.test.ts` "an unknown email gets no mail and the same answer, so nobody can probe for accounts" |
| CC6.2 | A link works once, expires in 15 minutes, and only its hash is stored | Code | `src/auth/index.ts` | `src/auth/auth.test.ts` "a link works once", `src/auth/auth.test.ts` "a link expires after 15 minutes", `src/auth/auth.test.ts` "only a hash of the link is stored" |
| CC6.2 | Sessions are server-side, revocable and end after 12 hours | Code | `src/auth/index.ts` | `src/auth/auth.test.ts` "signing out ends the session on the server, not just in the browser" and `src/auth/auth.test.ts` "a session ends after 12 hours" |
| CC6.2 | A forged or altered session cookie is refused | Code | `src/auth/index.ts` | `src/auth/auth.test.ts` "a forged or altered cookie is refused" |
| CC6.3 | Roles: owner, team, agent. The agent deletes nothing | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "the agent cannot delete customers" |
| CC6.3 | Only the owner approves anything a customer will see | Code | `src/review/approvals.ts` | `src/review/review.test.ts` "only the owner can approve" and `src/db/db.test.ts` "the agent can write a draft only as pending, and only the owner can approve it" |
| CC6.3 | A team member signs in with team rights, not owner rights | Code | `src/auth/index.ts` | `src/auth/auth.test.ts` "a team member signs in as team" |
| CC6.4 | Physical access to servers | Host | `docs/compliance/subprocessors.md` | The host's own SOC 2 report |
| CC6.6 | Voice calls need a signed, short-lived token tied to one call | Code | `src/agent/token.ts` | `src/agent/agent.test.ts` "expired, tampered or foreign tokens are refused" and `src/agent/routes.test.ts` "refuses a missing or forged token" |
| CC6.6 | Rate limits on calls, tool calls and sign-in. They are kept in memory on each server instance, so a host-level limit (firewall or edge rate limiting) is the backstop | Code + Host | `src/agent/limits.ts` | `src/agent/routes.test.ts` "limits calls per visitor", `src/agent/routes.test.ts` "tool calls per call are limited on the server" and `src/agent/agent.test.ts` "allows up to the limit in a window, then refuses, then recovers" |
| CC6.6 | Without its secret the app is unavailable, not insecure | Code | `src/agent/routes.ts` | `src/agent/routes.test.ts` "is unavailable, not insecure, without a session secret" and `src/agent/agent.test.ts` "a short or missing secret is an error, not a weak token" |
| CC6.6 | The scheduler endpoint needs its own key and is off without one | Code | `src/agent/routes.ts` | `src/agent/routes.test.ts` "refuses anyone else, and is off when no scheduler key is set" |
| CC6.6 | The voice model key never reaches the browser | Code | `src/providers/index.ts` | `src/providers/providers.test.ts` "the voice model is started on the server: the browser sends an offer and gets an answer, never a key" |
| CC6.7 | HTTPS only (HSTS), no framing, no sniffing, microphone for this site alone | Code | `next.config.ts` | `src/compliance/headers.test.ts` "every response is HTTPS only, cannot be framed or sniffed, and only this site gets the microphone" |
| CC6.8 | Known-vulnerable dependencies fail the build; a bill of materials is published | Code | `.github/workflows/ci.yml` | CI job `dependencies` |
| CC6.8 | Static analysis of the code on every change | Code | `.github/workflows/codeql.yml` | CI job `codeql` |

## CC7: system operations

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| CC7.1 | Dependency updates proposed weekly | Code | `.github/dependabot.yml` | Dependabot pull requests |
| CC7.1 | Keys and tokens are caught before they land | Code | `.github/workflows/ci.yml` | CI job `secrets` (gitleaks on every commit) |
| CC7.2 | Every write leaves an audit row naming who did it | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "every write leaves a row naming who did it" |
| CC7.2 | Sign-ins are in the owner's audit log | Code | `db/migrations/0003_auth.sql` | `src/auth/auth.test.ts` "each sign-in is in the owner's audit log" |
| CC7.2 | The audit log is append-only, the owner included | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "nobody can change or delete a row, the owner included" |
| CC7.2 | The audit log is hash-chained over every column; an edit behind its back is detected | Code | `src/db/index.ts` | `src/db/db.test.ts` "the hash chain verifies, and a row edited behind its back breaks it" and `src/db/audit.test.ts` "moving a row to another business breaks the chain" |
| CC7.2 | The newest audit row is logged outside the database every day, so a cut or a full rewrite is caught | Code + Company | `src/agent/routes.ts` | `src/db/audit.test.ts` "rows cut off the end are caught against a saved head" and `src/db/audit.test.ts` "a rewrite of the whole chain is caught against a saved head" |
| CC7.2 | Only the owner reads the audit log | Code | `db/migrations/0001_init.sql` | `src/db/db.test.ts` "only the owner can read it" |
| CC7.3 | A caller's injection attempt is flagged, stored as text and never obeyed | Code | `src/agent/tools.ts` | `src/agent/tools.test.ts` "the caller's words are data: an injection attempt is stored as text and flagged, never obeyed" |
| CC7.4 | Incident response: triage, contain, notify, review | Company | `docs/compliance/policies/incident-response.md` | Company runs a tabletop once a year |
| CC7.5 | Recovery from a lost or damaged database | Code + Company | `docs/compliance/backup-restore.md` | `src/compliance/backup.test.ts` "a restored database has every row the original had" |

## CC8: change management

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| CC8.1 | Every change needs a code owner's review | Code + Company | `.github/CODEOWNERS` | Branch protection on `main` (see `docs/compliance/policies/change-management.md`) |
| CC8.1 | Every change passes types, lint, tests and a build before merge | Code | `.github/workflows/ci.yml` | CI job `check` |
| CC8.1 | Pull requests state what changed, why, and how it was tested | Code | `.github/pull_request_template.md` | Each merged pull request |
| CC8.1 | Database changes are versioned migrations, applied once | Code | `src/db/index.ts` | `src/db/db.test.ts` "a second run applies nothing" |
| CC8.1 | Mike's instructions cannot change without the voice suite seeing it | Code | `scripts/export-voice-ci.ts` | `evals/brightwater/outcome.test.ts` "the suite's live.json is exactly Mike's real session (regenerate with bun scripts/export-voice-ci.ts)" |

## CC9: risk mitigation and vendors

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| CC9.1 | Restore tested in code, drilled on the real database | Code + Company | `docs/compliance/backup-restore.md` | `src/compliance/backup.test.ts` "the restore check passes: audit chain intact, row-level security still forced, no migration missing" |
| CC9.2 | Every outside service listed with what it receives | Company | `docs/compliance/subprocessors.md` | Reviewed once a year (`docs/compliance/policies/vendor-management.md`) |
| CC9.2 | The model provider is told not to keep requests | Code | `src/providers/index.ts` | `src/providers/providers.test.ts` "every model request tells the provider not to store it (business data stays out of retention and training)" |
| CC9.2 | Missing keys fail closed; texts never reach a real phone by accident | Code | `src/providers/index.ts` | `src/providers/providers.test.ts` "live mode fails closed when a key is missing, naming the variable, never a value" and `src/providers/providers.test.ts` "live SMS stays off unless explicitly enabled, so nothing reaches a real phone by accident" |

## A1: availability

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| A1.2 | Backups of the database | Host + Company | `docs/compliance/backup-restore.md` | Host snapshot settings plus a nightly logical dump |
| A1.3 | Restores are tested, and a bad restore is caught | Code + Company | `src/compliance/backup.ts` | `src/compliance/backup.test.ts` "the restore check catches a restore that lost rows" and `src/compliance/backup.test.ts` "encrypted contact details survive the restore and still need the key" |

## C1: confidentiality

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| C1.1 | Every kind of data is listed with its sensitivity, place and lifetime | Code | `docs/compliance/data-inventory.md` | `src/compliance/docs.test.ts` "the data inventory covers every table in the schema" |
| C1.1 | No tool gives a caller another customer's details | Code | `src/agent/tools.ts` | `src/agent/redteam.test.ts` "no tool ever returns another customer's name, number or address" |
| C1.1 | The team views show names and work, never contact details | Code | `src/team/queries.ts` | `src/team/queries.test.ts` "shows the pipeline and the next visits, with names and work, never contact details" |
| C1.2 | Transcripts, sign-in links and sessions are deleted on a schedule | Code | `src/compliance/retention.ts` | `src/jobs/jobs.test.ts` "old transcripts are cleared, expired sign-in links and old sessions removed; the calls themselves stay" |
| C1.2 | The owner can delete a customer everywhere; the audit keeps that it happened, not what was said | Code | `src/jobs/index.ts` | `src/jobs/jobs.test.ts` "the owner can delete a customer everywhere; the audit log keeps that it happened, not what was said" |
| C1.2 | Deleting a customer also removes the briefings that name them | Code | `src/jobs/index.ts` | `src/jobs/jobs.test.ts` "deleting a customer also removes the briefings that name them" |
| C1.2 | The retention periods on paper match the code | Code | `src/compliance/retention.ts` | `src/compliance/docs.test.ts` "the retention periods in the docs match the code that enforces them" |

## PI1: processing integrity of the AI's outputs

| Criterion | Control | Owner | Where | Proof |
|---|---|---|---|---|
| PI1.2 | Tool inputs from the model are validated; bad ones are refused with a reason | Code | `src/agent/tools.ts` | `src/agent/tools.test.ts` "bad arguments are rejected with a reason the model can act on" |
| PI1.2 | Oversized input is capped | Code | `src/agent/tools.ts` | `src/agent/redteam.test.ts` "oversized input is capped, not stored whole" |
| PI1.3 | One booking per call, only an open slot, a call finished once | Code | `src/agent/tools.ts` | `src/agent/tools.test.ts` "books at most one visit per call", `src/agent/tools.test.ts` "refuses a visit that is no longer open", `src/agent/tools.test.ts` "a call is finished once" |
| PI1.3 | After a call is recorded its tools stop | Code | `src/agent/tools.ts` | `src/agent/redteam.test.ts` "once a call is recorded, its tools stop: no booking after the goodbye" |
| PI1.3 | A transcript is accepted once, while the call is fresh, so it cannot be overwritten or graded again | Code | `src/agent/routes.ts` | `src/agent/routes.test.ts` "a transcript is accepted once per call, so it cannot be overwritten or graded again" and `src/agent/routes.test.ts` "a transcript is refused after the call's time is over" |
| PI1.3 | Openings and bookings are said in the business's own time zone | Code | `src/agent/tools.ts` | `src/agent/tools.test.ts` "openings and bookings are labeled in the business's own time zone, read from the database" |
| PI1.3 | Calls are capped in time | Code | `src/agent/limits.ts` | `src/agent/tools.test.ts` "past the call time cap, tools stop working and the guardrail shows it" |
| PI1.4 | Every call ends on a fixed closing line, so nothing is promised by accident | Code | `src/agent/prompt.ts` | `src/agent/agent.test.ts` "end every call with a fixed closing line, so nothing is promised by accident" |
| PI1.4 | Customer texts pass code rules (no price, promise, link, pressure) before any model sees them | Code | `src/review/rules.ts` | `src/review/review.test.ts` "a rules failure never reaches the model" and `src/agent/redteam.test.ts` "a price spelled out in words is still a price" |
| PI1.4 | The review model fails closed | Code | `src/review/review.ts` | `src/review/review.test.ts` "fails closed when the model errors or answers in the wrong shape" |
| PI1.4 | Nothing reaches a customer until the owner taps approve | Code | `src/review/approvals.ts` | `src/review/review.test.ts` "Mike's draft is reviewed, then waits as pending; nothing is sent" and `src/review/review.test.ts` "a rejected draft is never sent, and a decided draft cannot be decided again" |
| PI1.4 | A send that failed can be retried, and is sent once | Code | `src/review/approvals.ts` | `src/review/review.test.ts` "a send that failed can be retried from the app, and is sent once" |
| PI1.4 | The owner's edits still pass the rules | Code | `src/review/approvals.ts` | `src/review/review.test.ts` "the owner can edit before sending; the edit must still pass the rules" |
| PI1.4 | Every call that ends with a transcript is graded; a grader failure shows as needing a look, never as passed | Code | `src/jobs/index.ts` | `src/jobs/jobs.test.ts` "if the grader fails, the call shows as needing a look, never as passed" and `src/jobs/jobs.test.ts` "a customer call with no address is incomplete, whatever the model says" |
| PI1.5 | Tests are repeatable: the model is scripted in tests, never live | Code | `src/providers/index.ts` | `src/providers/providers.test.ts` "fake model answers come from a script, so tests are repeatable" |

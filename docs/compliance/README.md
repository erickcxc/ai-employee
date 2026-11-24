# SOC 2 readiness

This repo is **SOC 2 ready**: the technical controls a SOC 2 audit looks for are built in, mapped to
the criteria and proven by tests that run on every change. That is what this folder is.

## What "SOC 2 ready" means here, and what it does not

SOC 2 is an auditor's report on a **company**: its people, processes and systems, observed over
time. A codebase cannot pass an audit or hold a certificate on its own, and nothing in this repo
claims to.

What this repo gives a company that runs it:
- **Controls built in.** Row-level security, least-privilege roles, encrypted contact details, an append-only hash-chained audit log, one-time sign-in links and revocable sessions, signed call tokens, rate limits, a human approval gate on everything a customer sees, scheduled deletion, a tested restore.
- **Evidence an auditor can check.** Every control in `docs/compliance/controls.md` names the file that implements it and the test that proves it. `src/compliance/docs.test.ts` fails CI if any of those references breaks.
- **Templates for the rest.** Policies, a risk register, a data inventory, a subprocessor list and a restore runbook, ready to adopt.

What the company still has to do:
1. **Adopt the policies.** Fill in the names, approve them, and actually run them (`docs/compliance/policies/`).
2. **Run it on hosts with their own SOC 2 reports** and keep those reports on file (`docs/compliance/subprocessors.md`).
3. **Turn on what lives outside the code:** branch protection with required reviews, host backups, MFA on every admin account, the model provider's data settings.
4. **Keep the records.** Access reviews, restore drills, incident write-ups, vendor reviews. Those records are the evidence for the company-run controls.
5. **Hire an auditor.** A Type I report looks at the design of the controls on one date. A Type II report watches them work over an observation period, usually three to twelve months.

## What is in this folder

| File | What it is |
|---|---|
| `docs/compliance/controls.md` | The controls matrix: criterion, control, owner, code, test |
| `docs/compliance/risks.md` | The AI risk register: injection, leaks, wrong outcomes, unsafe drafts, each with its mitigation and test |
| `docs/compliance/data-inventory.md` | The data flow diagram and every kind of data: sensitivity, place, access, lifetime |
| `docs/compliance/subprocessors.md` | Every outside service, what it receives, and the model provider settings that keep data out of training |
| `docs/compliance/backup-restore.md` | The backup and restore runbook, with the restore test and the drill |
| `docs/compliance/policies/` | Policy templates: access control, change management, incident response, vendor management, data retention, backup and recovery |

## Run the evidence yourself

```sh
bun install
bun test          # every control test, the restore test and the docs check
```

Everything runs locally with no keys: the sample business, Brightwater Plumbing, is synthetic.

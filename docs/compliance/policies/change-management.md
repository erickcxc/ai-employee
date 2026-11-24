# Change management policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 CC8.1.

**Company:** [Company] · **Policy owner:** [name, role] · **Approved:** [date] · **Next review:** [date + 1 year]

## Purpose

Every change to the system is reviewed, tested and traceable before it reaches customers.

## Rules

1. **All changes go through a pull request** to `main`. Nobody pushes to `main` directly, admins included.
2. **Branch protection on `main`** (set in the code host): require a pull request, require at least one approving review from a code owner (`.github/CODEOWNERS`), require the CI checks to pass, require branches to be up to date, block force pushes and deletion, and require signed commits.
3. **CI must pass** (`.github/workflows/ci.yml`): types, lint, the full test suite, a build, the secret scan and the dependency audit. Static analysis runs in `.github/workflows/codeql.yml`.
4. **The pull request says what changed, why, and how it was tested** (`.github/pull_request_template.md`).
5. **Database changes are migrations** in `db/migrations/`, never hand edits to production. A migration that changes access (roles, policies, grants) needs the policy owner's review.
6. **Changes to Mike** (`src/agent/prompt.ts`, his tools, the review rules) also run the voice suite (`evals/brightwater/suite.yaml`) before merge, and the result is linked in the pull request.
7. **Emergency changes** may be merged with one review after the fact, within [1 business day], and the reason is written in the pull request.
8. **Releases** are deployed from `main` only. The deployment record (commit, time, who) is kept by the host.

## Evidence

- Merged pull requests with reviews and passing checks.
- Branch protection settings exported once a year.
- Deployment history from the host.

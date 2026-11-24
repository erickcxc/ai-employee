# Vendor management policy

> Template. Replace each `[bracketed]` item, have the policy owner approve it, and record the date.
> SOC 2 CC9.2.

**Company:** [Company] · **Policy owner:** [name, role] · **Approved:** [date] · **Next review:** [date + 1 year]

## Purpose

Every outside service that touches customer data is known, chosen with care and checked once a year.

## Rules

1. **The list.** `docs/compliance/subprocessors.md` lists every service that receives data, what it receives and the setting that limits it. Nothing new receives customer data until it is on the list.
2. **Before adding a vendor:** get its SOC 2 report (or ISO 27001 certificate), read the parts that cover the service you use, sign its data processing agreement, and confirm it does not train on your data.
3. **Model providers** get extra checks: the settings in `docs/compliance/subprocessors.md`, "Model provider settings", are confirmed on the account, not assumed.
4. **Least data.** Send each vendor only what its job needs. The app's provider interface (`src/providers/index.ts`) is where that is decided and tested.
5. **Yearly review.** Each year: get each vendor's current report, note any exceptions the auditor found, confirm the settings are still in place, remove vendors no longer used.
6. **Leaving a vendor:** remove its key, confirm in writing that it deleted your data, update the list.

## Evidence

- The current subprocessor list with dates.
- Each vendor's latest SOC 2 report and signed agreement.
- The yearly review record.

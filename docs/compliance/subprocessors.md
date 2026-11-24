# Subprocessors

Every outside service the AI employee sends data to, what it receives and the setting that limits
it. SOC 2 CC9.2 (vendor management). This is a template: a company running this repo fills in the
last two columns, keeps the providers' own SOC 2 reports on file and reviews the list once a year
(`docs/compliance/policies/vendor-management.md`).

Swap any provider by changing `src/providers/index.ts`; the rest of the app only sees the interface.

| Service | Used for | Receives | Limiting setting | Their SOC 2 report on file | Data processing agreement signed |
|---|---|---|---|---|---|
| Voice model provider (OpenAI, live sessions) | Mike's voice on calls | Caller audio, live; Mike's instructions | Session started from the server, key never in the browser; see "Model provider settings" below | | |
| Language model provider (OpenAI, Responses API) | Writing follow-ups, reviewing drafts, grading calls, the daily briefing | Text: drafts, call summaries, transcripts | `store: false` on every request; see below | | |
| SMS provider (Twilio) | Texts the owner approved | Customer phone number, the approved text | Off unless `SMS_LIVE=1` | | |
| Email provider (Resend) | Sign-in links, the approved daily briefing | Owner and team email, the link or briefing | Off unless a key is set | | |
| App host (for example Vercel) | Runs the app and the daily job | Everything in transit through the app | HTTPS only; secrets in the host's secret store | | |
| Database host (any Postgres) | Stores the data | Everything in `docs/compliance/data-inventory.md` | Encrypted at rest by the host; contact fields also encrypted by the app | | |
| Code host and CI (GitHub) | Source, reviews, tests, scans | Code only. No customer data | Branch protection, required reviews | | |

## Model provider settings

These keep business data out of the provider's retention and training. Check each one when the
account is set up and again at every annual review, because providers change their terms.

1. **Do not store responses.** Every language model request sets `store: false`, so the provider does not keep the response for later retrieval. Enforced in code and tested: `src/providers/providers.test.ts` "every model request tells the provider not to store it (business data stays out of retention and training)".
2. **No training on API data.** At the time of writing, OpenAI's API terms say API data is not used to train its models unless the customer opts in. In the organization's data controls, leave any option to share inputs and outputs with the provider turned off.
3. **Zero data retention (optional, by contract).** Providers may keep API traffic for a limited time for abuse monitoring. A company that needs nothing kept at all can apply to the provider for zero data retention on its organization. That is an agreement with the provider, not a code setting.
4. **Separate key per environment.** Use one API key for production and another for testing, each in its own project, so a leaked test key never touches production data.

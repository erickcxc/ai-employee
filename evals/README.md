# Voice tests

`evals/brightwater/` is a [voice-ci](https://github.com/erickcxc/voice-ci) agent folder for Mike. AI callers
phone him over the real voice model, and every call is graded on the record it leaves (exact match on
verdict, urgency, last name, house number) and on its `must` lines. The tools run this repo's real code
against a fresh synthetic Brightwater database on each call (`outcome.ts`).

Eight callers: a booking, a burst pipe, a message, a sales pitch, and the red team: a pitch posing as a
customer, a caller fishing for a neighbor's details, a prompt-injection attempt, and a Spanish speaker.

```
# from a voice-ci checkout, with OPENAI_API_KEY and GEMINI_API_KEY set
bin/voice-ci run /path/to/ai-employee/evals/brightwater
```

`live.json` is generated from `src/agent/prompt.ts`; after changing Mike, run `bun scripts/export-voice-ci.ts`.
A test fails if they drift. Red-team cases that need no model run with the unit tests (`src/agent/redteam.test.ts`).

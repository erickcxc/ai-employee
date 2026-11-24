// Writes evals/brightwater/live.json for voice-ci from Mike's real session (src/agent/prompt.ts), so
// the voice suite always tests the instructions, tools and closing lines that ship. A test fails if
// the committed file drifts: run `bun scripts/export-voice-ci.ts` after changing Mike.
import { writeFileSync } from "node:fs";
import { closingLine, GREETING, sessionBody } from "../src/agent/prompt";

export function voiceCiLive() {
  const say = (line: string) => `Say exactly, then stop: "${line}"`;
  return {
    session: sessionBody({}),
    greeting: `Greet the caller now, in English, with exactly: "${GREETING}" Then listen.`,
    greeting_event: "commentary",
    said_goodbye: "(have a good|have a great|take care|goodbye|bye now)",
    outcome_tool: "finish_call",
    tool_output: { default: JSON.stringify({ recorded: true, note: "Recorded. Say your closing line now." }) },
    closing_instruction: {
      job: say(closingLine("job", null)),
      booked: say(closingLine("booked", null)),
      urgent: say(closingLine("urgent", null)),
      message: say(closingLine("message", null)),
      spam: say(closingLine("spam", null)),
    },
  };
}

if (import.meta.main) {
  writeFileSync("evals/brightwater/live.json", `${JSON.stringify(voiceCiLive(), null, 2)}\n`);
  console.log("wrote evals/brightwater/live.json");
}

import { expect, test } from "bun:test";
import { createLatency, readEvent } from "./events";

const fc = (args: string) => ({
  type: "response.event",
  event: { type: "response.output_item.done", item: { type: "function_call", name: "check_openings", call_id: "c1", arguments: args } },
});

test("a nested function call is read", () => {
  expect(readEvent(fc('{"slot_id":"s1"}'))).toEqual({ type: "tool_call", callId: "c1", name: "check_openings", args: { slot_id: "s1" } });
});

test("malformed arguments give empty args", () => {
  expect(readEvent(fc("{nope"))).toMatchObject({ type: "tool_call", args: {} });
});

test("transcript deltas and close are read", () => {
  expect(readEvent({ type: "session.input_transcript.delta", delta: "hi" })).toEqual({ type: "visitor", delta: "hi" });
  expect(readEvent({ type: "session.output_transcript.delta", delta: "hey" })).toEqual({ type: "agent", delta: "hey" });
  expect(readEvent({ type: "session.closed" })).toEqual({ type: "closed" });
  expect(readEvent({ type: "session.started" })).toEqual({ type: "started" });
});

test("everything else is null", () => {
  for (const v of [null, 3, "x", {}, { type: "response.event", event: { type: "response.created" } }, { type: "session.input_transcript.delta" }])
    expect(readEvent(v)).toBeNull();
  const msg = { type: "response.event", event: { type: "response.output_item.done", item: { type: "message" } } };
  expect(readEvent(msg)).toBeNull();
});

test("latency is measured from the visitor's last words to the agent's first", () => {
  const l = createLatency();
  l.visitor(1000);
  l.visitor(1400);
  expect(l.agent(2100)).toBe(700);
  expect(l.agent(2200)).toBeNull(); // same agent turn
  l.visitor(3000);
  expect(l.agent(3350)).toBe(350);
});

test("no latency before the visitor speaks", () => {
  expect(createLatency().agent(500)).toBeNull();
});

// Reads the live voice session's data channel events for Mike. A backend function call arrives nested:
// response.event -> response.output_item.done -> item.type "function_call" (the same shape the
// production sideband reads). Pure, so it is tested without a browser.

export type CallEvent =
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "visitor"; delta: string }
  | { type: "agent"; delta: string }
  | { type: "started" }
  | { type: "closed" };

type Raw = { type?: unknown; delta?: unknown; event?: { type?: unknown; item?: { type?: unknown; name?: unknown; call_id?: unknown; arguments?: unknown } } };

export function readEvent(raw: unknown): CallEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Raw;
  if (m.type === "session.started") return { type: "started" };
  if (m.type === "session.closed") return { type: "closed" };
  if (m.type === "session.input_transcript.delta" && typeof m.delta === "string") return { type: "visitor", delta: m.delta };
  if (m.type === "session.output_transcript.delta" && typeof m.delta === "string") return { type: "agent", delta: m.delta };
  if (m.type !== "response.event" || m.event?.type !== "response.output_item.done") return null;
  const item = m.event.item;
  if (item?.type !== "function_call" || typeof item.name !== "string" || typeof item.call_id !== "string") return null;
  let args: unknown = {};
  try {
    args = JSON.parse(typeof item.arguments === "string" ? item.arguments : "{}");
  } catch {
    args = {};
  }
  return { type: "tool_call", callId: item.call_id, name: item.name, args: args && typeof args === "object" ? args : {} };
}

/** Turn latency: from the visitor's last transcript delta to the agent's first one after it. */
export function createLatency() {
  let lastVisitor = 0;
  let waiting = false;
  return {
    visitor(at: number) {
      lastVisitor = at;
      waiting = true;
    },
    agent(at: number): number | null {
      if (!waiting) return null;
      waiting = false;
      return at - lastVisitor;
    },
  };
}

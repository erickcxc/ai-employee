"use client";

// The browser side of a call with Mike: microphone, WebRTC to the voice model (through our session
// route, so the key stays on the server), each backend tool call relayed to /api/call/tool with the
// signed token and its output sent back, the panel's event log, the closing line, and the caps: a
// five-minute limit and an idle cutoff.
import { useCallback, useEffect, useRef, useState } from "react";
import { IDLE_CUTOFF_MS, MAX_CALL_MS } from "@/agent/limits";
import type { PanelEvent } from "@/agent/tools";
import { readEvent } from "./events";

export type Status = "idle" | "connecting" | "live" | "ended" | "error";
export type Line = { who: "caller" | "mike"; text: string };
export type Logged = PanelEvent & { ms: number };

const CLOSE_BACKSTOP_MS = 15_000;
const TAIL_MS = 1200; // let the closing line's audio finish after its transcript ends

export function useCall() {
  const [status, setStatus] = useState<Status>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [events, setEvents] = useState<Logged[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const token = useRef<string | null>(null);
  const greeting = useRef("");
  const t0 = useRef(0);
  const lastActive = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const closing = useRef<{ line: string; heard: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const linesRef = useRef<Line[]>([]);

  const log = useCallback((list: PanelEvent[]) => {
    const ms = t0.current ? Date.now() - t0.current : 0;
    setEvents((prev) => [...prev, ...list.map((e) => ({ ...e, ms }))]);
  }, []);

  const say = useCallback((who: Line["who"], delta: string) => {
    lastActive.current = Date.now();
    setLines((prev) => {
      const last = prev.at(-1);
      const next = last?.who === who ? [...prev.slice(0, -1), { who, text: last.text + delta }] : [...prev, { who, text: delta }];
      linesRef.current = next;
      return next;
    });
  }, []);

  const hangUp = useCallback((why: string) => {
    if (ticker.current) clearInterval(ticker.current);
    if (closing.current) clearTimeout(closing.current.timer);
    closing.current = null;
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    mic.current = null;
    // Hand the transcript to the server for grading; keepalive lets it finish if the page closes.
    if (token.current && linesRef.current.length) {
      void fetch("/api/call/transcript", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current, lines: linesRef.current }) }).catch(() => {});
      token.current = null;
    }
    if (why !== "unmount") {
      log([{ type: "guardrail", rule: "call_ended", detail: why, at: new Date().toISOString() }]);
      setStatus("ended");
    }
  }, [log]);

  const start = useCallback(async () => {
    setLines([]);
    linesRef.current = [];
    setEvents([]);
    setError(null);
    setStatus("connecting");
    try {
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peer = new RTCPeerConnection();
      pc.current = peer;
      audio.current ??= Object.assign(new Audio(), { autoplay: true });
      peer.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      mic.current.getTracks().forEach((t) => peer.addTrack(t, mic.current!));
      const channel = peer.createDataChannel("oai-events");
      const send = (event: object) => channel.readyState === "open" && channel.send(JSON.stringify(event));

      channel.onmessage = (msg) => {
        let raw: unknown;
        try {
          raw = JSON.parse(msg.data);
        } catch {
          return;
        }
        const ev = readEvent(raw);
        if (!ev) return;
        if (ev.type === "started") {
          t0.current = Date.now();
          lastActive.current = Date.now();
          setStatus("live");
          log([{ type: "guardrail", rule: "call_started", detail: "5 minute cap, idle cutoff, caller's words treated as data", at: new Date().toISOString() }]);
          send({ type: "session.commentary.append", event_id: "greeting", delegation_id: null, content: greeting.current });
          ticker.current = setInterval(() => {
            const now = Date.now();
            if (now - t0.current > MAX_CALL_MS) hangUp("time cap reached");
            else if (now - lastActive.current > IDLE_CUTOFF_MS) hangUp("no one spoke for a while");
          }, 1000);
        } else if (ev.type === "visitor") say("caller", ev.delta);
        else if (ev.type === "agent") {
          say("mike", ev.delta);
          const c = closing.current;
          if (c) {
            c.heard += ev.delta;
            const norm = (s: string) => s.replace(/\W/g, "").toLowerCase();
            if (norm(c.heard).includes(norm(c.line).slice(-24))) {
              clearTimeout(c.timer);
              closing.current = null;
              setTimeout(() => hangUp("closing line said"), TAIL_MS);
            }
          }
        } else if (ev.type === "closed") hangUp("session closed");
        else if (ev.type === "tool_call") {
          void (async () => {
            let output: Record<string, unknown> = { error: "tool unreachable" };
            try {
              const res = await fetch("/api/call/tool", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token.current, name: ev.name, args: ev.args }),
              });
              const data = (await res.json()) as { output?: Record<string, unknown>; events?: PanelEvent[] };
              output = data.output ?? output;
              log(data.events ?? []);
            } catch {
              log([{ type: "guardrail", rule: "tool_unreachable", detail: ev.name, at: new Date().toISOString() }]);
            }
            send({ type: "response.item.create", item: { type: "function_call_output", call_id: ev.callId, output: JSON.stringify(output) } });
            send({ type: "response.create" });
            if (ev.name === "finish_call" && typeof output.say === "string") {
              const line = output.say;
              send({ type: "session.instructions.append", event_id: "closing", delegation_id: null, content: `Say exactly, then stop: "${line}"` });
              closing.current = { line, heard: "", timer: setTimeout(() => hangUp("closing line timeout"), CLOSE_BACKSTOP_MS) };
            }
          })();
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("The call dropped.");
          hangUp("connection failed");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const res = await fetch("/api/call/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sdp: offer.sdp }) });
      const data = (await res.json()) as { sdp?: string; token?: string; greeting?: string; message?: string };
      if (!res.ok || !data.sdp || !data.token) throw new Error(data.message || "Could not start the call.");
      token.current = data.token;
      greeting.current = data.greeting ?? "";
      await peer.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } catch (e) {
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(denied ? "Microphone access is needed to talk to Mike." : (e as Error).message);
      hangUp("could not start");
      setStatus("error");
    }
  }, [hangUp, log, say]);

  useEffect(() => () => hangUp("unmount"), [hangUp]);

  return { status, lines, events, error, start, hangUp: () => hangUp("caller hung up") };
}

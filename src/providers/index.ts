// Every outside service Mike touches sits behind one of these interfaces, so the whole system runs
// locally on fakes (PROVIDERS=fake) and swaps to real services with env vars alone. Live mode fails
// closed: a missing key is an error naming the variable, never a silent fallback. Live SMS needs its
// own switch (SMS_LIVE=1), so a test run can never text a real phone.

export type Env = Record<string, string | undefined>;

export interface Voice {
  kind: "fake" | "live";
  /** Starts a voice call from the browser's WebRTC offer. The API key stays on the server. */
  startCall(input: { sdp: string; session: Record<string, unknown> }): Promise<{ sdp: string }>;
  started: { session: Record<string, unknown> }[];
}

export interface Llm {
  kind: "fake" | "live";
  /** One model call that must return JSON. */
  json<T = unknown>(input: { system: string; user: string; model?: string }): Promise<T>;
}

export interface Sms {
  kind: "fake" | "live";
  send(msg: { to: string; body: string }): Promise<{ id: string }>;
  sent: { to: string; body: string }[];
}

export interface Email {
  kind: "fake" | "live";
  send(msg: { to: string; subject: string; text: string }): Promise<{ id: string }>;
  sent: { to: string; subject: string; text: string }[];
}

export interface Providers {
  voice: Voice;
  llm: Llm;
  sms: Sms;
  email: Email;
}

/** Scripted answers for the fake model, consumed in order. */
export type Script = { llm?: unknown[] };

const need = (env: Env, name: string) => {
  const v = env[name];
  if (!v) throw new Error(`${name} is required when PROVIDERS=live`);
  return v;
};

function fakeVoice(): Voice {
  const started: Voice["started"] = [];
  return {
    kind: "fake",
    started,
    async startCall({ session }) {
      started.push({ session });
      return { sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=fake\r\n" };
    },
  };
}

function fakeLlm(script: unknown[] = []): Llm {
  const queue = [...script];
  return {
    kind: "fake",
    async json<T>() {
      if (!queue.length) throw new Error("fake llm: no scripted answer left");
      return queue.shift() as T;
    },
  };
}

function fakeSms(): Sms {
  const sent: Sms["sent"] = [];
  return { kind: "fake", sent, async send(m) { sent.push(m); return { id: `fake_sms_${sent.length}` }; } };
}

function fakeEmail(): Email {
  const sent: Email["sent"] = [];
  return { kind: "fake", sent, async send(m) { sent.push(m); return { id: `fake_email_${sent.length}` }; } };
}

const OPENAI = "https://api.openai.com/v1";

function liveVoice(key: string): Voice {
  return {
    kind: "live",
    started: [],
    async startCall({ sdp, session }) {
      const res = await fetch(`${OPENAI}/live/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session, transport: { type: "webrtc", sdp } }),
      });
      const data = (await res.json()) as { transport?: { sdp?: string }; error?: { message?: string } };
      if (!res.ok || !data.transport?.sdp) throw new Error(`voice session failed: ${res.status} ${data.error?.message ?? ""}`.trim());
      return { sdp: data.transport.sdp };
    },
  };
}

function liveLlm(key: string, defaultModel: string): Llm {
  return {
    kind: "live",
    async json<T>({ system, user, model }: { system: string; user: string; model?: string }) {
      const res = await fetch(`${OPENAI}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model ?? defaultModel,
          instructions: system,
          // JSON mode needs the word JSON in the input itself.
          input: `Reply in JSON. ${user}`,
          text: { format: { type: "json_object" } },
          reasoning: { effort: "low" },
          // Not kept by the provider after the reply (docs/compliance/subprocessors.md).
          store: false,
        }),
      });
      if (!res.ok) throw new Error(`llm status ${res.status}`);
      const data = (await res.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
      const raw = data.output_text ?? data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "";
      return JSON.parse(raw) as T;
    },
  };
}

function liveSms(env: Env): Sms {
  const sid = need(env, "TWILIO_ACCOUNT_SID");
  const token = need(env, "TWILIO_AUTH_TOKEN");
  const from = need(env, "TWILIO_FROM_NUMBER");
  return {
    kind: "live",
    sent: [],
    async send({ to, body }) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      const data = (await res.json()) as { sid?: string };
      if (!res.ok || !data.sid) throw new Error(`sms status ${res.status}`);
      return { id: data.sid };
    },
  };
}

function liveEmail(env: Env): Email {
  const key = need(env, "RESEND_API_KEY");
  const from = need(env, "EMAIL_FROM");
  return {
    kind: "live",
    sent: [],
    async send({ to, subject, text }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      const data = (await res.json()) as { id?: string };
      if (!res.ok || !data.id) throw new Error(`email status ${res.status}`);
      return { id: data.id };
    },
  };
}

export function providers(env: Env = process.env, script: Script = {}): Providers {
  const mode = env.PROVIDERS ?? "fake";
  if (mode === "fake") return { voice: fakeVoice(), llm: fakeLlm(script.llm), sms: fakeSms(), email: fakeEmail() };
  if (mode !== "live") throw new Error(`PROVIDERS must be "fake" or "live", got "${mode}"`);

  const key = need(env, "OPENAI_API_KEY");
  return {
    voice: liveVoice(key),
    llm: liveLlm(key, env.OPENAI_MODEL ?? "gpt-5.4-mini"),
    sms: env.SMS_LIVE === "1" ? liveSms(env) : fakeSms(),
    email: env.RESEND_API_KEY ? liveEmail(env) : fakeEmail(),
  };
}

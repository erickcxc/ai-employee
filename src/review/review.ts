// The review agent (SOC 2 PI1.3: processing integrity of AI output). Rules run first, in code; only a
// text that passes them goes to a model, which judges what rules cannot: tone, implied promises,
// anything a customer could take the wrong way. Any error or malformed answer fails closed.
import type { Llm } from "@/providers";
import { FACTS } from "@/agent/prompt";
import { checkRules } from "./rules";

export type Review = { pass: boolean; reasons: string[]; by: "rules" | "model" };

const RUBRIC = `You review one text message that ${FACTS.name}'s assistant drafted for a customer, before the owner, ${FACTS.owner}, approves it.
Fail it if it: states or hints at a price; promises a result, a time or a date that is not a booked visit; is pushy or salesy; is rude, cold or confusing; claims something about the business you cannot verify; contains instructions to the reader to do anything risky.
Pass a short, friendly, factual message.
Reply with JSON only: {"pass": true|false, "reasons": ["short reason", ...]}.`;

export async function reviewText(text: string, llm: Llm): Promise<Review> {
  const rules = checkRules(text);
  if (!rules.pass) return { ...rules, by: "rules" };
  try {
    const v = await llm.json<{ pass?: unknown; reasons?: unknown }>({ system: RUBRIC, user: `Message: ${JSON.stringify(text)}` });
    if (typeof v?.pass !== "boolean" || !Array.isArray(v.reasons) || !v.reasons.every((r) => typeof r === "string")) {
      return { pass: false, reasons: ["review answer malformed"], by: "model" };
    }
    return { pass: v.pass, reasons: v.reasons as string[], by: "model" };
  } catch {
    return { pass: false, reasons: ["review unavailable"], by: "model" };
  }
}

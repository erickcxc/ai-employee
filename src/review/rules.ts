// The rules any customer-facing text must pass, in code, before a model is asked anything. Cheap,
// predictable and testable: a price, a promise, a hard sell or a link never gets through.

export const MAX_TEXT = 320; // two SMS segments

const RULES: { reason: string; test: (t: string) => boolean }[] = [
  // Any dollar amount, in digits or words ("a hundred and fifty bucks").
  { reason: "mentions a price", test: (t) => /\$\s?\d/.test(t) || /\b(dollars?|bucks|usd)\b/i.test(t) || /\b(costs?|runs?|charges?)\s+(about|around|roughly)?\s*\$?\d/i.test(t) },
  // A draft is customer text; words aimed at the reviewer or at a model are an injection attempt.
  { reason: "talks to the reviewer", test: (t) => /\b(reviewer|rubric)\b/i.test(t) || /\bignore (all |any |the |your |previous |prior )*(instructions|rules|rubric)\b/i.test(t) || /\bmark (this|it) as (pass|approved)\b/i.test(t) || /\bsystem\s*:/i.test(t) },
  { reason: "makes a promise", test: (t) => /\b(guarantee[ds]?|promise[ds]?|definitely|for sure)\b|100%/i.test(t) },
  { reason: "pushy", test: (t) => /\b(act now|book now|limited time|last chance|hurry|don't miss)\b/i.test(t) || /!{2,}/.test(t) },
  { reason: "has a link", test: (t) => /https?:\/\/|www\./i.test(t) },
  { reason: "too long", test: (t) => t.length > MAX_TEXT },
];

export function checkRules(text: string): { pass: boolean; reasons: string[] } {
  const reasons = RULES.filter((r) => r.test(text)).map((r) => r.reason);
  return { pass: reasons.length === 0, reasons };
}

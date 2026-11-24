// Per-visitor rate limits and call caps (SOC 2 A1.1: capacity; CC6.6: abuse). In memory per server
// instance; behind several instances, swap for a shared store with the same signature.

export const MAX_CALL_MS = 5 * 60_000;
export const IDLE_CUTOFF_MS = 45_000;

export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

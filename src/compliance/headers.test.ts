// SOC 2 CC6.6, CC6.7: the headers every response carries.
import { expect, test } from "bun:test";
import config from "../../next.config";

test("every response is HTTPS only, cannot be framed or sniffed, and only this site gets the microphone", async () => {
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*")!;
  const h = Object.fromEntries(all.headers.map((x) => [x.key, x.value]));
  expect(h["Strict-Transport-Security"]).toContain("max-age=63072000");
  expect(h["X-Frame-Options"]).toBe("DENY");
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
  expect(h["Permissions-Policy"]).toBe("microphone=(self), camera=(), geolocation=()");
  expect(config.poweredByHeader).toBe(false);
});

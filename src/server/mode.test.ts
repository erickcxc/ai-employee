import { describe, expect, test } from "bun:test";
import { runMode } from "./mode";

describe("run mode", () => {
  test("the sign-in shortcut is for a local machine only: fake services, no real database, not a production build", () => {
    expect(runMode({ PROVIDERS: "fake", NODE_ENV: "development" }).local).toBe(true);
    expect(runMode({ NODE_ENV: "development" }).local).toBe(true);
    expect(runMode({ PROVIDERS: "fake", NODE_ENV: "production" }).local).toBe(false);
    expect(runMode({ PROVIDERS: "live", OPENAI_API_KEY: "x", DATABASE_URL: "postgres://h/db", NODE_ENV: "development" }).local).toBe(false);
  });

  test("fake services against a real database refuse to start, so a deployment never runs with the shortcut or the dev key", () => {
    expect(() => runMode({ DATABASE_URL: "postgres://h/db" })).toThrow("PROVIDERS=live");
    expect(() => runMode({ PROVIDERS: "fake", DATABASE_URL: "postgres://h/db", NODE_ENV: "production" })).toThrow("PROVIDERS=live");
  });
});

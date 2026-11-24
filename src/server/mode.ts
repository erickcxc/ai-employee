// Which mode the app runs in, decided once at start-up from the environment.
// "local" turns on the sign-in shortcut (the link opens instead of being emailed) and allows a
// non-secure cookie, so it is only ever true on a developer's machine: fake services, the in-process
// database and a dev build. Fake services pointed at a real database refuse to start.
type Env = Record<string, string | undefined>;

export function runMode(env: Env): { local: boolean } {
  const fake = (env.PROVIDERS ?? "fake") === "fake";
  if (fake && env.DATABASE_URL) {
    throw new Error("DATABASE_URL is set but services are fake: set PROVIDERS=live (and every key in .env.example) to run against a real database");
  }
  return { local: fake && !env.DATABASE_URL && env.NODE_ENV !== "production" };
}

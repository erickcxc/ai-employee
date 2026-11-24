// Controls as code for the docs themselves: the controls matrix, the risk register and the data
// inventory point at real files and real tests, so the evidence a reviewer is shown cannot drift
// away from the code. Rename a test or a file and this fails until the docs are updated.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RETENTION } from "./retention";

const DOCS = "docs/compliance";
const read = (f: string) => readFileSync(f, "utf8");
const allDocs = () => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".md")) out.push(join(dir, e.name));
    }
  };
  walk(DOCS);
  return out;
};

// A test is cited as `path/to/file.test.ts` "the test's exact name".
const TEST_REF = /`([\w./-]+\.test\.ts)` "([^"]+)"/g;
// A file is cited as `src/...`, `db/...`, `.github/...` and so on.
const FILE_REF = /`((?:src|db|docs|scripts|evals|\.github)\/[\w./[\]()-]+|[A-Z]+\.md|\.env\.example|next\.config\.ts|vercel\.json)`/g;

describe("the compliance docs", () => {
  test("exist: the README, controls matrix, data inventory, subprocessors, risk register, restore runbook and policies", () => {
    for (const f of ["README.md", "controls.md", "data-inventory.md", "subprocessors.md", "risks.md", "backup-restore.md"]) {
      expect(existsSync(join(DOCS, f))).toBe(true);
    }
    for (const p of ["access-control", "change-management", "incident-response", "vendor-management", "data-retention", "backup-and-recovery"]) {
      expect(existsSync(join(DOCS, "policies", `${p}.md`))).toBe(true);
    }
  });

  test("every test they cite exists, by file and exact name", () => {
    const missing: string[] = [];
    let cited = 0;
    for (const doc of allDocs()) {
      for (const [, file, name] of read(doc).matchAll(TEST_REF)) {
        cited++;
        if (!existsSync(file) || !read(file).includes(`test("${name}"`)) missing.push(`${doc}: ${file} "${name}"`);
      }
    }
    expect(missing).toEqual([]);
    expect(cited).toBeGreaterThan(40);
  });

  test("every file they cite exists", () => {
    const missing: string[] = [];
    for (const doc of allDocs()) {
      for (const [, file] of read(doc).matchAll(FILE_REF)) if (!existsSync(file)) missing.push(`${doc}: ${file}`);
    }
    expect(missing).toEqual([]);
  });

  test("the data inventory covers every table in the schema", () => {
    const inventory = read(join(DOCS, "data-inventory.md"));
    const tables = readdirSync("db/migrations")
      .flatMap((f) => [...read(join("db/migrations", f)).matchAll(/create table (\w+)/g)].map((m) => m[1]));
    expect(tables.length).toBeGreaterThan(10);
    expect(tables.filter((t) => !inventory.includes(`\`${t}\``))).toEqual([]);
  });

  test("the retention periods in the docs match the code that enforces them", () => {
    const inventory = read(join(DOCS, "data-inventory.md"));
    expect(inventory).toContain(`${RETENTION.transcriptDays} days`);
    expect(inventory).toContain(`${RETENTION.sessionDays} days`);
  });

  test("never claim SOC 2 compliance or certification: a repo cannot have either", () => {
    const claims = allDocs().filter((d) => /SOC ?2[- ](compliant|certified|compliance certified)/i.test(read(d)));
    expect(claims).toEqual([]);
  });
});

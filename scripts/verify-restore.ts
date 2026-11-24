// Restore drill for server Postgres (docs/compliance/backup-restore.md).
//   Before the backup:  bun scripts/verify-restore.ts counts  > counts.json   (DATABASE_URL = production)
//   After the restore:  bun scripts/verify-restore.ts check counts.json        (DATABASE_URL = the restored copy)
// Exits 1 and lists every problem if the restored copy is not whole.
import { readFileSync } from "node:fs";
import { openDb } from "../src/db";
import { decryptField } from "../src/db/crypto";
import { tableCounts, verifyRestore } from "../src/compliance/backup";

const [mode, file] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("set DATABASE_URL to the database to read");
const db = await openDb({ url });
try {
  if (mode === "counts") {
    console.log(JSON.stringify(await tableCounts(db), null, 2));
  } else if (mode === "check" && file) {
    const r = await verifyRestore(db, JSON.parse(readFileSync(file, "utf8")));
    // With the production field key set, prove the key and the restored data belong together.
    if (process.env.FIELD_KEY) {
      const [c] = await db.admin.query<{ phone_enc: string }>(`select phone_enc from customers where phone_enc is not null limit 1`);
      try {
        if (c) decryptField(c.phone_enc, Buffer.from(process.env.FIELD_KEY, "base64"));
        console.log(c ? "field key: ok" : "field key: no encrypted rows to check");
      } catch {
        r.ok = false;
        r.problems.push("field key: does not decrypt the restored data");
      }
    }
    console.log(r.ok ? "restore verified" : r.problems.join("\n"));
    process.exitCode = r.ok ? 0 : 1;
  } else {
    throw new Error("usage: verify-restore.ts counts | check <counts.json>");
  }
} finally {
  await db.close();
}

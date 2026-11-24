// Loads the synthetic Brightwater Plumbing business into a fresh database. Refuses to run twice.
import { fieldKey } from "../src/db/crypto";
import { openDb } from "../src/db";
import { BRIGHTWATER, seed } from "../src/db/seed";

const db = await openDb({ url: process.env.DATABASE_URL || undefined, dataDir: ".data/pg" });
await db.migrate();
const existing = await db.admin.query(`select id from businesses where id = $1`, [BRIGHTWATER]);
if (existing.length) {
  console.log("Brightwater is already seeded");
} else {
  await seed(db, { key: fieldKey() });
  console.log("seeded Brightwater Plumbing");
}
await db.close();

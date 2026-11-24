// Applies pending migrations. Local: an in-process Postgres stored in .data/. Production: DATABASE_URL,
// connected as the admin role (BYPASSRLS), never the app's runtime role.
import { openDb } from "../src/db";

const db = await openDb({ url: process.env.DATABASE_URL || undefined, dataDir: ".data/pg" });
const applied = await db.migrate();
console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
await db.close();

// Builds the database the static site starts from: schema + the default spreadsheet, packed as a PGlite data dir.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { ROOT } from "../server/db";
import { SCHEMA_SQL } from "../server/schema";
import { seedIfEmpty } from "../server/seed";

const db = await PGlite.create({ extensions: { pg_trgm } });
await db.exec(SCHEMA_SQL);
const summary = await db.transaction((tx) => seedIfEmpty(tx));
if (!summary) throw new Error("Seeding failed: is data/Chemical Inventory - Merged_updated.xlsx present?");
await db.exec("VACUUM ANALYZE");
const dump = await db.dumpDataDir("gzip");
await db.close();

const out = path.join(ROOT, "dist", "chemstock-seed.tar.gz");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
console.log(`[static] wrote ${path.relative(ROOT, out)} (${(dump.size / 1024 / 1024).toFixed(1)} MB)`);

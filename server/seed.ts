import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseRow } from "../shared/importParse";
import taxonomy from "../data/taxonomy.json";
import { one, ROOT, type Db } from "./db";
import { commitRows } from "./importer";
import { readWorkbook } from "./readWorkbook";

export const SOURCE_FILE = "Chemical Inventory - Merged_updated.xlsx";

export async function seedCategories(db: Db) {
  let order = 0;
  for (const top of taxonomy) {
    const parent = await one<{ id: number }>(
      db,
      `INSERT INTO categories (slug, category_name, description, icon, color, sort_order, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (slug) DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [top.slug, top.name, top.description, top.icon, top.color, order++],
    );
    let childOrder = 0;
    for (const child of top.children) {
      await db.query(
        `INSERT INTO categories (slug, category_name, parent_category_id, sort_order, is_system)
         VALUES ($1, $2, $3, $4, true) ON CONFLICT (slug) DO NOTHING`,
        [child.slug, child.name, parent!.id, childOrder++],
      );
    }
  }
}

/** Imports the original spreadsheet once, on first start. */
export async function seedIfEmpty(db: Db) {
  const seeded = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM import_batches WHERE kind = 'seed'");
  if (seeded!.n > 0) return null;
  // Taxonomy is seeded once; afterwards users own it, so deleted categories must not reappear on restart.
  await seedCategories(db);
  const file = path.join(ROOT, "data", SOURCE_FILE);
  if (!existsSync(file)) {
    console.warn(`[seed] ${file} not found – starting with an empty inventory`);
    return null;
  }
  const { rows } = readWorkbook(readFileSync(file));
  const parsed = rows.map(parseRow);
  const summary = await commitRows(db, parsed, { fileName: SOURCE_FILE, kind: "seed" });
  console.log(`[seed] imported ${summary.rows} rows → ${summary.chemicalsCreated} chemicals, ${summary.containersCreated} containers, ${summary.needsReview} for review`);
  return summary;
}

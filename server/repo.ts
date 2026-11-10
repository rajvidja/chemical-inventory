import { casDigits, checkCas } from "../shared/cas";
import { compactName, normalizeLocation, normalizeText } from "../shared/normalize";
import { parsePackSize } from "../shared/stock";
import { many, one, type Db } from "./db";

export async function ensureLocation(db: Db, name: string | null | undefined): Promise<number | null> {
  const clean = normalizeLocation(name);
  if (!clean) return null;
  const existing = await one<{ id: number }>(db, "SELECT id FROM storage_locations WHERE lower(location_name) = lower($1)", [clean]);
  if (existing) return existing.id;
  const row = await one<{ id: number }>(db, "INSERT INTO storage_locations (location_name) VALUES ($1) RETURNING id", [clean]);
  return row!.id;
}

export async function ensureTag(db: Db, name: string): Promise<number> {
  const clean = name.trim();
  const existing = await one<{ id: number }>(db, "SELECT id FROM chemical_tags WHERE lower(tag_name) = lower($1)", [clean]);
  if (existing) return existing.id;
  const row = await one<{ id: number }>(db, "INSERT INTO chemical_tags (tag_name) VALUES ($1) RETURNING id", [clean]);
  return row!.id;
}

export function chemicalNameFields(name: string) {
  return { normalized: normalizeText(name), compact: compactName(name) };
}

export function casFields(cas: string | null | undefined) {
  const check = checkCas(cas);
  return {
    cas_number: check.cas,
    cas_digits: check.cas ? casDigits(check.cas) : null,
    cas_valid: check.ok,
  };
}

export async function addSynonyms(db: Db, chemicalId: number, synonyms: string[], source: string) {
  for (const s of synonyms) {
    const synonym = s.trim();
    if (!synonym) continue;
    await db.query(
      `INSERT INTO chemical_synonyms (chemical_id, synonym, normalized, compact, source)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chemical_id, normalized) DO NOTHING`,
      [chemicalId, synonym, normalizeText(synonym), compactName(synonym), source],
    );
  }
}

export async function setCategories(
  db: Db,
  chemicalId: number,
  categoryIds: number[],
  primaryId: number | null,
  source: string,
) {
  await db.query("DELETE FROM chemical_categories WHERE chemical_id = $1", [chemicalId]);
  const ids = [...new Set(categoryIds)];
  const primary = primaryId && ids.includes(primaryId) ? primaryId : ids[0] ?? null;
  for (const id of ids) {
    await db.query(
      "INSERT INTO chemical_categories (chemical_id, category_id, is_primary, source) VALUES ($1, $2, $3, $4)",
      [chemicalId, id, id === primary, source],
    );
  }
  await db.query("UPDATE chemicals SET primary_category_id = $2, updated_at = now() WHERE id = $1", [chemicalId, primary]);
}

export async function setTags(db: Db, chemicalId: number, tags: string[]) {
  await db.query("DELETE FROM chemical_tag_mapping WHERE chemical_id = $1", [chemicalId]);
  for (const tag of [...new Set(tags.map((t) => t.trim()).filter(Boolean))]) {
    const tagId = await ensureTag(db, tag);
    await db.query("INSERT INTO chemical_tag_mapping VALUES ($1, $2) ON CONFLICT DO NOTHING", [chemicalId, tagId]);
  }
}

export async function refreshSearch(db: Db, chemicalId: number) {
  await db.query("SELECT refresh_chemical_search($1)", [chemicalId]);
}

export async function logActivity(
  db: Db,
  action: string,
  chemicalId: number | null,
  containerId: number | null,
  detail: Record<string, unknown> = {},
) {
  await db.query("INSERT INTO activity_log (chemical_id, container_id, action, detail) VALUES ($1, $2, $3, $4)", [
    chemicalId,
    containerId,
    action,
    JSON.stringify(detail),
  ]);
}

export interface ContainerInput {
  brand?: string | null;
  packSize?: string | null;
  remainingPercentage?: number | null;
  location?: string | null;
  notes?: string | null;
  expiryDate?: string | null;
}

export async function insertContainer(
  db: Db,
  chemicalId: number,
  c: ContainerInput,
  extra: { sourceRow?: number | null; importRecordId?: number | null } = {},
) {
  const pack = parsePackSize(c.packSize);
  const locationId = await ensureLocation(db, c.location);
  const row = await one<{ id: number }>(
    db,
    `INSERT INTO stock_containers
       (chemical_id, brand, pack_size, pack_size_value, pack_size_unit, remaining_percentage,
        storage_location_id, mentioned_locations, notes, source_excel_row, import_record_id, expiry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      chemicalId,
      c.brand?.trim() || null,
      c.packSize?.trim() || null,
      pack.value,
      pack.unit,
      c.remainingPercentage ?? null,
      locationId,
      c.location ? [normalizeLocation(c.location)] : [],
      c.notes?.trim() || null,
      extra.sourceRow ?? null,
      extra.importRecordId ?? null,
      c.expiryDate || null,
    ],
  );
  return row!.id;
}

export async function categoryIdsBySlug(db: Db): Promise<Map<string, number>> {
  const rows = await many<{ id: number; slug: string }>(db, "SELECT id, slug FROM categories");
  return new Map(rows.map((r) => [r.slug, r.id]));
}

import { casDigits } from "../shared/cas";
import { compactName, normalizeText } from "../shared/normalize";
import type { StockStatus } from "../shared/stock";
import type {
  AlertPriority,
  OpenOrder,
  CategoryRef,
  ChemicalListItem,
  ContainerSummary,
  MatchField,
  SearchFilters,
  SortKey,
} from "../shared/types";
import { many, type Db } from "./db";

const MIN_SCORE = 0.36;
const RELATIVE_CUTOFF = 0.55;

class Params {
  values: unknown[] = [];
  add(v: unknown) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
}

export function prepareQuery(raw: string) {
  const q = normalizeText(raw);
  const cq = compactName(raw);
  const isCasLike = /^[\d\s-]+$/.test(q) && /\d/.test(q);
  const dq = isCasLike ? casDigits(q) : "";
  const tokens = q.split(/[\s,]+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length > 0);
  const tsq = tokens.length > 1 ? tokens.map((t) => `${t}:*`).join(" & ") : "";
  const wordStart = `(^|[^a-z0-9])${escapeRegex(q)}`;
  return { q, cq, dq, tsq, wordStart };
}

/** SQL producing (chemical_id, score, field, matched) – best match per chemical for the query. */
function hitsSql(p: Params, raw: string) {
  const { q, cq, dq, tsq, wordStart } = prepareQuery(raw);
  const Q = p.add(q);
  const CQ = p.add(cq);
  const DQ = p.add(dq);
  const TS = p.add(tsq);
  const WS = p.add(wordStart);
  return /* sql */ `
  hits AS (
    SELECT c.id AS chemical_id,
      GREATEST(
        CASE WHEN c.normalized_name = ${Q} OR c.compact_name = ${CQ} THEN 1.0
             WHEN length(${CQ}) >= 3 AND c.compact_name LIKE ${CQ} || '%' THEN 0.93
             WHEN c.normalized_name ~ ${WS} THEN 0.86
             WHEN length(${CQ}) >= 3 AND c.compact_name LIKE '%' || ${CQ} || '%' THEN 0.76
             ELSE 0 END,
        word_similarity(${Q}, c.normalized_name) * 0.78,
        similarity(${CQ}, c.compact_name) * 0.8
      ) AS score, 'name' AS field, c.chemical_name AS matched
    FROM chemicals c
    UNION ALL
    SELECT s.chemical_id,
      GREATEST(
        CASE WHEN s.normalized = ${Q} OR s.compact = ${CQ} THEN 0.97
             WHEN length(${CQ}) >= 3 AND s.compact LIKE ${CQ} || '%' THEN 0.84
             WHEN s.normalized ~ ${WS} THEN 0.8
             ELSE 0 END,
        word_similarity(${Q}, s.normalized) * 0.7,
        similarity(${CQ}, s.compact) * 0.72
      ), 'synonym', s.synonym
    FROM chemical_synonyms s
    UNION ALL
    SELECT c.id,
      CASE WHEN c.cas_digits = ${DQ} THEN 1.0 WHEN c.cas_digits LIKE ${DQ} || '%' THEN 0.9 ELSE 0.7 END,
      'cas', c.cas_number
    FROM chemicals c
    WHERE length(${DQ}) >= 3 AND c.cas_digits LIKE '%' || ${DQ} || '%'
      AND (length(${DQ}) >= 4 OR c.cas_digits LIKE ${DQ} || '%')
    UNION ALL
    SELECT sc.chemical_id, CASE WHEN lower(l.location_name) = ${Q} THEN 0.96 ELSE 0.8 END, 'location', l.location_name
    FROM stock_containers sc JOIN storage_locations l ON l.id = sc.storage_location_id
    WHERE lower(l.location_name) = ${Q} OR (length(${Q}) >= 2 AND lower(l.location_name) LIKE ${Q} || '%')
    UNION ALL
    SELECT sc.chemical_id, CASE WHEN lower(m) = ${Q} THEN 0.96 ELSE 0.8 END, 'location', m
    FROM stock_containers sc, unnest(sc.mentioned_locations) AS m
    WHERE sc.needs_review AND (lower(m) = ${Q} OR (length(${Q}) >= 2 AND lower(m) LIKE ${Q} || '%'))
    UNION ALL
    SELECT sc.chemical_id,
      GREATEST(
        CASE WHEN lower(sc.brand) = ${Q} THEN 0.9 WHEN lower(sc.brand) LIKE ${Q} || '%' THEN 0.82 ELSE 0 END,
        similarity(${Q}, lower(sc.brand)) * 0.7
      ), 'brand', sc.brand
    FROM stock_containers sc WHERE sc.brand IS NOT NULL
    UNION ALL
    SELECT sc.chemical_id, 0.8, 'brand', sc.raw_brand
    FROM stock_containers sc
    WHERE sc.needs_review AND length(${Q}) >= 2 AND lower(sc.raw_brand) ~ ${WS}
    UNION ALL
    SELECT cc.chemical_id,
      CASE WHEN lower(n.name) = ${Q} THEN 0.8
           WHEN lower(n.name) ~ ${WS} THEN 0.72
           ELSE similarity(${Q}, lower(n.name)) * 0.6 END,
      'category', n.name
    FROM chemical_categories cc
    JOIN categories cat ON cat.id = cc.category_id
    LEFT JOIN categories par ON par.id = cat.parent_category_id
    CROSS JOIN LATERAL (VALUES (cat.category_name), (par.category_name)) AS n(name)
    WHERE n.name IS NOT NULL AND length(${Q}) >= 3
    UNION ALL
    SELECT m.chemical_id,
      CASE WHEN lower(t.tag_name) = ${Q} THEN 0.75 WHEN lower(t.tag_name) ~ ${WS} THEN 0.68 ELSE 0 END,
      'tag', t.tag_name
    FROM chemical_tag_mapping m JOIN chemical_tags t ON t.id = m.tag_id
    WHERE length(${Q}) >= 3
    UNION ALL
    SELECT c.id, 0.62, 'class', c.chemical_class
    FROM chemicals c WHERE length(${Q}) >= 4 AND lower(c.chemical_class) ~ ${WS}
    UNION ALL
    SELECT c.id, 0.7 + 0.2 * ts_rank(c.search_vector, to_tsquery('simple', ${TS})), 'text', c.chemical_name
    FROM chemicals c WHERE ${TS} <> '' AND c.search_vector @@ to_tsquery('simple', ${TS})
  ),
  best AS (
    SELECT DISTINCT ON (chemical_id) chemical_id, score, field, matched
    FROM hits WHERE score >= ${MIN_SCORE}
    ORDER BY chemical_id, score DESC
  )`;
}

function filterSql(p: Params, f: SearchFilters) {
  const where: string[] = [];
  if (f.categories?.length) {
    const cats = p.add(f.categories);
    const match = (slug: string) => `EXISTS (
        SELECT 1 FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id
        LEFT JOIN categories par ON par.id = cat.parent_category_id
        WHERE cc.chemical_id = c.id AND (cat.slug = ${slug} OR par.slug = ${slug}))`;
    where.push(
      f.categoryMode === "all"
        ? `NOT EXISTS (SELECT 1 FROM unnest(${cats}::text[]) AS want(slug) WHERE NOT ${match("want.slug")})`
        : `EXISTS (SELECT 1 FROM unnest(${cats}::text[]) AS want(slug) WHERE ${match("want.slug")})`,
    );
  }
  if (f.brands?.length) {
    const b = p.add(f.brands.map((x) => x.toLowerCase()));
    where.push(`EXISTS (SELECT 1 FROM stock_containers sc WHERE sc.chemical_id = c.id AND (
      lower(sc.brand) = ANY(${b})
      OR (sc.needs_review AND EXISTS (SELECT 1 FROM unnest(${b}::text[]) AS bb WHERE lower(sc.raw_brand) LIKE '%' || bb || '%'))))`);
  }
  if (f.locations?.length) {
    const l = p.add(f.locations.map((x) => x.toLowerCase()));
    where.push(`EXISTS (SELECT 1 FROM stock_containers sc LEFT JOIN storage_locations loc ON loc.id = sc.storage_location_id
      WHERE sc.chemical_id = c.id AND (lower(loc.location_name) = ANY(${l})
        OR (sc.needs_review AND EXISTS (SELECT 1 FROM unnest(sc.mentioned_locations) m WHERE lower(m) = ANY(${l})))))`);
  }
  if (f.statuses?.length) {
    const s = p.add(f.statuses);
    where.push(`(cs.status = ANY(${s}) OR ('review' = ANY(${s}) AND cs.review_count > 0))`);
  }
  if (f.classes?.length) where.push(`c.chemical_class = ANY(${p.add(f.classes)})`);
  if (f.tags?.length) {
    const t = p.add(f.tags.map((x) => x.toLowerCase()));
    where.push(`EXISTS (SELECT 1 FROM chemical_tag_mapping m JOIN chemical_tags t ON t.id = m.tag_id
      WHERE m.chemical_id = c.id AND lower(t.tag_name) = ANY(${t}))`);
  }
  return where;
}

const ORDER: Record<SortKey, string> = {
  relevance: "round(b.score::numeric, 2) DESC, length(c.chemical_name) ASC, c.chemical_name ASC",
  name: "lower(c.chemical_name) ASC",
  cas: "c.cas_digits ASC NULLS LAST",
  availability_desc: "cs.best_pct DESC NULLS LAST, lower(c.chemical_name)",
  availability_asc: "cs.best_pct ASC NULLS LAST, lower(c.chemical_name)",
  location: `(SELECT min(l.location_name) FROM stock_containers sc JOIN storage_locations l ON l.id = sc.storage_location_id WHERE sc.chemical_id = c.id) ASC NULLS LAST, lower(c.chemical_name)`,
  brand: `(SELECT min(lower(sc.brand)) FROM stock_containers sc WHERE sc.chemical_id = c.id) ASC NULLS LAST, lower(c.chemical_name)`,
  updated: `GREATEST(c.updated_at, (SELECT max(sc.updated_at) FROM stock_containers sc WHERE sc.chemical_id = c.id)) DESC`,
};

interface ListRow {
  id: number;
  chemical_name: string;
  cas_number: string | null;
  cas_valid: boolean;
  chemical_formula: string | null;
  chemical_class: string | null;
  status: StockStatus;
  best_pct: string | null;
  container_count: number;
  review_count: number;
  score: number | null;
  field: MatchField | null;
  matched: string | null;
  updated_at: string;
  alert_priority: AlertPriority | null;
  total: number;
}

export async function searchChemicals(
  db: Db,
  opts: { q?: string; filters?: SearchFilters; sort?: SortKey; limit?: number; offset?: number; ids?: number[] },
) {
  const started = performance.now();
  const p = new Params();
  const q = (opts.q ?? "").trim();
  const hasQuery = q.length > 0;
  const where = filterSql(p, opts.filters ?? {});
  if (opts.ids) where.push(`c.id = ANY(${p.add(opts.ids)})`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // With a strong hit, drop the long tail of weak fuzzy matches; when every hit is weak (typos), keep them all.
  // The cutoff is relative to the best hit *within the active filters*.
  const withSql = hasQuery
    ? `WITH ${hitsSql(p, q)},
      scoped AS (
        SELECT b.* FROM best b JOIN chemicals c ON c.id = b.chemical_id JOIN chemical_stock cs ON cs.chemical_id = c.id ${whereSql}
      ),
      ranked AS (
        SELECT * FROM scoped WHERE score >= (SELECT max(score) FROM scoped) * ${RELATIVE_CUTOFF}
      )`
    : "";
  const sort = opts.sort && (opts.sort !== "relevance" || hasQuery) ? opts.sort : hasQuery ? "relevance" : "name";
  const limit = p.add(Math.min(opts.limit ?? 50, 1000));
  const offset = p.add(opts.offset ?? 0);
  const sql = `${withSql}
    SELECT c.id, c.chemical_name, c.cas_number, c.cas_valid, c.chemical_formula, c.chemical_class,
           cs.status, cs.best_pct, cs.container_count, cs.review_count, c.updated_at, c.alert_priority,
           ${hasQuery ? "b.score, b.field, b.matched" : "NULL::float AS score, NULL AS field, NULL AS matched"},
           count(*) OVER ()::int AS total
    FROM chemicals c
    JOIN chemical_stock cs ON cs.chemical_id = c.id
    ${hasQuery ? "JOIN ranked b ON b.chemical_id = c.id" : whereSql}
    ORDER BY ${ORDER[sort]}, c.id
    LIMIT ${limit} OFFSET ${offset}`;
  const rows = await many<ListRow>(db, sql, p.values);
  const items = await hydrate(db, rows);
  return { items, total: rows[0]?.total ?? 0, tookMs: Math.round(performance.now() - started) };
}

export async function containersFor(db: Db, chemicalIds: number[]): Promise<Map<number, ContainerSummary[]>> {
  const rows = await many<{
    id: number;
    chemical_id: number;
    brand: string | null;
    pack_size: string | null;
    pack_size_value: string | null;
    pack_size_unit: string | null;
    remaining_percentage: string | null;
    remaining_quantity: string | null;
    location_name: string | null;
    storage_location_id: number | null;
    status: StockStatus;
    needs_review: boolean;
    raw_brand: string | null;
    raw_pack_size: string | null;
    raw_availability: string | null;
    raw_location: string | null;
    mentioned_locations: string[];
    notes: string | null;
    expiry: string | null;
    source_excel_row: number | null;
    updated_at: string;
  }>(
    db,
    `SELECT sc.*, l.location_name, to_char(sc.expiry_date, 'YYYY-MM-DD') AS expiry,
            CASE WHEN sc.needs_review THEN 'review' ELSE stock_status(sc.remaining_percentage) END AS status
     FROM stock_containers sc LEFT JOIN storage_locations l ON l.id = sc.storage_location_id
     WHERE sc.chemical_id = ANY($1)
     ORDER BY sc.needs_review DESC, sc.remaining_percentage DESC NULLS LAST, sc.id`,
    [chemicalIds],
  );
  const map = new Map<number, ContainerSummary[]>();
  for (const r of rows) {
    const list = map.get(r.chemical_id) ?? [];
    list.push({
      id: r.id,
      brand: r.brand,
      packSize: r.pack_size,
      packValue: r.pack_size_value === null ? null : Number(r.pack_size_value),
      packUnit: r.pack_size_unit,
      remainingPercentage: r.remaining_percentage === null ? null : Number(r.remaining_percentage),
      remainingQuantity: r.remaining_quantity === null ? null : Number(r.remaining_quantity),
      location: r.location_name,
      locationId: r.storage_location_id,
      status: r.status,
      needsReview: r.needs_review,
      raw: r.needs_review
        ? { brand: r.raw_brand, packSize: r.raw_pack_size, availability: r.raw_availability, location: r.raw_location }
        : null,
      mentionedLocations: r.mentioned_locations ?? [],
      notes: r.notes,
      expiryDate: r.expiry,
      sourceExcelRow: r.source_excel_row,
      updatedAt: r.updated_at,
    });
    map.set(r.chemical_id, list);
  }
  return map;
}

export async function categoriesFor(db: Db, chemicalIds: number[]): Promise<Map<number, CategoryRef[]>> {
  const rows = await many<{
    chemical_id: number;
    id: number;
    slug: string;
    name: string;
    color: string | null;
    icon: string | null;
    parent_slug: string | null;
    parent_name: string | null;
    parent_color: string | null;
    parent_icon: string | null;
    is_primary: boolean;
    source: string;
  }>(
    db,
    `SELECT cc.chemical_id, cat.id, cat.slug, cat.category_name AS name, cat.color, cat.icon,
            par.slug AS parent_slug, par.category_name AS parent_name, par.color AS parent_color, par.icon AS parent_icon,
            cc.is_primary, cc.source
     FROM chemical_categories cc
     JOIN categories cat ON cat.id = cc.category_id
     LEFT JOIN categories par ON par.id = cat.parent_category_id
     WHERE cc.chemical_id = ANY($1)
     ORDER BY cc.is_primary DESC, coalesce(par.sort_order, cat.sort_order), cat.sort_order`,
    [chemicalIds],
  );
  const map = new Map<number, CategoryRef[]>();
  for (const r of rows) {
    const list = map.get(r.chemical_id) ?? [];
    list.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      color: r.color ?? r.parent_color ?? "#788795",
      icon: r.icon ?? r.parent_icon ?? "package",
      parentSlug: r.parent_slug,
      parentName: r.parent_name,
      isPrimary: r.is_primary,
      source: r.source,
    });
    map.set(r.chemical_id, list);
  }
  return map;
}

const OPEN_ORDER_SQL = `SELECT id, chemical_id, supplier, to_char(ordered_on, 'YYYY-MM-DD') AS ordered_on,
  to_char(expected_on, 'YYYY-MM-DD') AS expected_on, notes FROM reorders WHERE status = 'ordered' AND chemical_id = ANY($1)`;

export async function openOrdersFor(db: Db, chemicalIds: number[]): Promise<Map<number, OpenOrder>> {
  const rows = await many<{ id: number; chemical_id: number; supplier: string | null; ordered_on: string; expected_on: string | null; notes: string | null }>(
    db,
    OPEN_ORDER_SQL,
    [chemicalIds],
  );
  return new Map(
    rows.map((r) => [r.chemical_id, { id: r.id, supplier: r.supplier, orderedOn: r.ordered_on, expectedOn: r.expected_on, notes: r.notes }]),
  );
}

async function hydrate(db: Db, rows: ListRow[]): Promise<ChemicalListItem[]> {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [containers, categories, orders] = await Promise.all([containersFor(db, ids), categoriesFor(db, ids), openOrdersFor(db, ids)]);
  return rows.map((r) => ({
    id: r.id,
    name: r.chemical_name,
    cas: r.cas_number,
    casValid: r.cas_valid,
    formula: r.chemical_formula,
    chemicalClass: r.chemical_class,
    status: r.status,
    bestPct: r.best_pct === null ? null : Number(r.best_pct),
    containerCount: r.container_count,
    reviewCount: r.review_count,
    categories: categories.get(r.id) ?? [],
    containers: containers.get(r.id) ?? [],
    priority: r.alert_priority,
    order: orders.get(r.id) ?? null,
    match: r.field ? { field: r.field, text: r.matched ?? "", score: Number(r.score) } : null,
    updatedAt: r.updated_at,
  }));
}

export async function listByIds(db: Db, ids: number[]) {
  if (!ids.length) return [];
  const { items } = await searchChemicals(db, { ids, limit: ids.length, sort: "name" });
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((x): x is ChemicalListItem => !!x);
}

export async function suggest(db: Db, raw: string) {
  const started = performance.now();
  const q = normalizeText(raw);
  const { items } = await searchChemicals(db, { q: raw, limit: 8 });
  const like = `${q}%`;
  const [locations, brands, categories] = await Promise.all([
    many<{ name: string; count: number }>(
      db,
      `SELECT l.location_name AS name, count(DISTINCT sc.chemical_id)::int AS count
       FROM storage_locations l LEFT JOIN stock_containers sc ON sc.storage_location_id = l.id
       WHERE lower(l.location_name) LIKE $1 GROUP BY l.id ORDER BY (lower(l.location_name) = $2) DESC, l.location_name LIMIT 4`,
      [like, q],
    ),
    many<{ name: string; count: number }>(
      db,
      `SELECT min(sc.brand) AS name, count(DISTINCT sc.chemical_id)::int AS count
       FROM stock_containers sc WHERE sc.brand IS NOT NULL AND (lower(sc.brand) LIKE $1 OR similarity(lower(sc.brand), $2) > 0.45)
       GROUP BY lower(sc.brand) ORDER BY count DESC LIMIT 3`,
      [like, q],
    ),
    q.length >= 3
      ? many<{ slug: string; name: string; color: string; icon: string; count: number }>(
          db,
          `SELECT cat.slug, cat.category_name AS name, coalesce(cat.color, par.color) AS color, coalesce(cat.icon, par.icon) AS icon,
                  (SELECT count(DISTINCT cc.chemical_id)::int FROM chemical_categories cc JOIN categories c2 ON c2.id = cc.category_id
                    WHERE c2.id = cat.id OR c2.parent_category_id = cat.id) AS count
           FROM categories cat LEFT JOIN categories par ON par.id = cat.parent_category_id
           WHERE lower(cat.category_name) ~ $1 OR similarity(lower(cat.category_name), $2) > 0.4
           ORDER BY count DESC LIMIT 3`,
          [`(^|[^a-z])${escapeRegex(q)}`, q],
        )
      : Promise.resolve([]),
  ]);
  return {
    chemicals: items,
    locations: q.length ? locations : [],
    brands: q.length >= 2 ? brands : [],
    categories: categories.filter((c) => c.count > 0),
    tookMs: Math.round(performance.now() - started),
  };
}

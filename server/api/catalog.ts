import { Hono } from "hono";
import { z } from "zod";
import { normalizeText } from "../../shared/normalize";
import type {
  AlertItem,
  AlertPriority,
  CategoryNode,
  DashboardResponse,
  InsightsResponse,
  InventoryStats,
  MetaResponse,
  ReorderItem,
} from "../../shared/types";
import type { StockStatus } from "../../shared/stock";
import { getDb, many, one, type Db } from "../db";
import { listByIds, openOrdersFor } from "../search";

async function categoryTree(db: Db): Promise<CategoryNode[]> {
  const rows = await many<{
    id: number;
    slug: string;
    category_name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    parent_category_id: number | null;
    is_system: boolean;
    direct_count: number;
  }>(
    db,
    `SELECT cat.*, (SELECT count(*)::int FROM chemical_categories cc WHERE cc.category_id = cat.id) AS direct_count
     FROM categories cat ORDER BY cat.sort_order, cat.category_name`,
  );
  const rollup = await many<{ parent_id: number; n: number }>(
    db,
    `SELECT coalesce(cat.parent_category_id, cat.id) AS parent_id, count(DISTINCT cc.chemical_id)::int AS n
     FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id GROUP BY 1`,
  );
  const topTags = await many<{ parent_id: number; tag_name: string }>(
    db,
    `SELECT parent_id, tag_name FROM (
       SELECT coalesce(cat.parent_category_id, cat.id) AS parent_id, t.tag_name,
              row_number() OVER (PARTITION BY coalesce(cat.parent_category_id, cat.id) ORDER BY count(*) DESC, t.tag_name) AS rn
       FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id
       JOIN chemical_tag_mapping m ON m.chemical_id = cc.chemical_id JOIN chemical_tags t ON t.id = m.tag_id
       GROUP BY 1, 2) x WHERE rn <= 5`,
  );
  const rollupMap = new Map(rollup.map((r) => [r.parent_id, r.n]));
  const nodes = new Map<number, CategoryNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.category_name,
      description: r.description,
      icon: r.icon ?? "package",
      color: r.color ?? "#788795",
      parentId: r.parent_category_id,
      isSystem: r.is_system,
      chemicalCount: r.parent_category_id ? r.direct_count : (rollupMap.get(r.id) ?? 0),
      children: [],
      topTags: topTags.filter((t) => t.parent_id === r.id).map((t) => t.tag_name),
    });
  }
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId)) {
      const parent = nodes.get(n.parentId)!;
      n.icon = parent.icon;
      n.color = parent.color;
      parent.children.push(n);
    } else roots.push(n);
  }
  return roots;
}

export async function thresholds(db: Db) {
  const s = await one<{ good_above: string; low_below: string }>(db, "SELECT good_above, low_below FROM settings WHERE id = 1");
  return { goodAbove: Number(s!.good_above), lowBelow: Number(s!.low_below) };
}

async function alerts(db: Db, statuses: StockStatus[], limit = 500): Promise<AlertItem[]> {
  const rows = await many<{
    id: number;
    chemical_id: number;
    chemical_name: string;
    cas_number: string | null;
    brand: string | null;
    pack_size: string | null;
    pack_size_unit: string | null;
    remaining_percentage: string | null;
    remaining_quantity: string | null;
    location_name: string | null;
    status: StockStatus;
    other_available: number;
    alert_priority: AlertPriority | null;
  }>(
    db,
    `SELECT sc.id, sc.chemical_id, c.chemical_name, c.cas_number, sc.brand, sc.pack_size, sc.pack_size_unit,
            sc.remaining_percentage, sc.remaining_quantity, l.location_name, stock_status(sc.remaining_percentage) AS status,
            (SELECT count(*)::int FROM stock_containers o WHERE o.chemical_id = sc.chemical_id AND o.id <> sc.id
               AND NOT o.needs_review AND stock_status(o.remaining_percentage) IN ('good', 'moderate')) AS other_available,
            c.alert_priority
     FROM stock_containers sc JOIN chemicals c ON c.id = sc.chemical_id
     LEFT JOIN storage_locations l ON l.id = sc.storage_location_id
     WHERE NOT sc.needs_review AND stock_status(sc.remaining_percentage) = ANY($1)
     ORDER BY EXISTS (SELECT 1 FROM reorders r WHERE r.chemical_id = c.id AND r.status = 'ordered'),
              ${PRIORITY_RANK}, sc.remaining_percentage ASC, lower(c.chemical_name) LIMIT $2`,
    [statuses, limit],
  );
  const orders = await openOrdersFor(db, [...new Set(rows.map((r) => r.chemical_id))]);
  return rows.map((r) => ({
    containerId: r.id,
    chemicalId: r.chemical_id,
    chemicalName: r.chemical_name,
    cas: r.cas_number,
    brand: r.brand,
    packSize: r.pack_size,
    packUnit: r.pack_size_unit,
    remainingPercentage: r.remaining_percentage === null ? null : Number(r.remaining_percentage),
    remainingQuantity: r.remaining_quantity === null ? null : Number(r.remaining_quantity),
    location: r.location_name,
    status: r.status,
    otherAvailable: r.other_available,
    priority: r.alert_priority,
    order: orders.get(r.chemical_id) ?? null,
  }));
}

const PRIORITY_RANK = "CASE c.alert_priority WHEN 'critical' THEN 0 WHEN 'watchlist' THEN 1 ELSE 2 END";

const STATS_SQL = `SELECT
  (SELECT count(*)::int FROM chemicals) AS "totalRecords",
  (SELECT count(DISTINCT coalesce(cas_digits, compact_name))::int FROM chemicals) AS "uniqueChemicals",
  (SELECT count(*)::int FROM stock_containers WHERE NOT needs_review) AS "totalContainers",
  (SELECT count(*)::int FROM chemical_stock WHERE status IN ('good', 'moderate', 'low')) AS available,
  (SELECT count(*)::int FROM chemical_stock WHERE status = 'good') AS good,
  (SELECT count(*)::int FROM chemical_stock WHERE status = 'moderate') AS moderate,
  (SELECT count(*)::int FROM chemical_stock WHERE status = 'low') AS low,
  (SELECT count(*)::int FROM chemical_stock WHERE status = 'out') AS out,
  (SELECT count(*)::int FROM chemical_stock WHERE status IN ('unknown', 'review')) AS unknown,
  (SELECT count(*)::int FROM categories WHERE parent_category_id IS NULL AND slug <> 'unclassified') AS categories,
  (SELECT count(*)::int FROM storage_locations) AS locations,
  (SELECT count(*)::int FROM import_records WHERE import_status = 'needs_review') AS "needsReview"`;

const EXPIRY_WINDOW_DAYS = 30;
const NOT_ORDERED = "NOT EXISTS (SELECT 1 FROM reorders r WHERE r.chemical_id = c.id AND r.status = 'ordered')";
const LIVE_EXPIRY = "sc.expiry_date IS NOT NULL AND NOT sc.needs_review AND coalesce(sc.remaining_percentage, 1) > 0";

const ATTENTION_SQL = `SELECT
  (SELECT count(*)::int FROM chemical_stock cs JOIN chemicals c ON c.id = cs.chemical_id WHERE cs.status = 'out' AND ${NOT_ORDERED}) AS out,
  (SELECT count(*)::int FROM chemical_stock cs JOIN chemicals c ON c.id = cs.chemical_id WHERE cs.status = 'low' AND ${NOT_ORDERED}) AS low,
  (SELECT count(*)::int FROM chemical_stock cs JOIN chemicals c ON c.id = cs.chemical_id
    WHERE cs.status IN ('low', 'out') AND c.alert_priority = 'critical' AND ${NOT_ORDERED}) AS critical,
  (SELECT count(*)::int FROM reorders WHERE status = 'ordered') AS ordered,
  (SELECT count(*)::int FROM import_records WHERE import_status = 'needs_review') AS "needsReview",
  (SELECT count(*)::int FROM stock_containers sc WHERE ${LIVE_EXPIRY} AND sc.expiry_date < current_date) AS expired,
  (SELECT count(*)::int FROM stock_containers sc WHERE ${LIVE_EXPIRY}
    AND sc.expiry_date BETWEEN current_date AND current_date + ${EXPIRY_WINDOW_DAYS}) AS "expiringSoon"`;

type Attention = DashboardResponse["attention"];

/** Upserts today's row, so each day keeps the last counts observed that day. */
async function recordSnapshot(db: Db, a: Attention) {
  await db.query(
    `INSERT INTO count_snapshots (day, low, out, needs_review, ordered) VALUES (current_date, $1, $2, $3, $4)
     ON CONFLICT (day) DO UPDATE SET low = EXCLUDED.low, out = EXCLUDED.out, needs_review = EXCLUDED.needs_review,
       ordered = EXCLUDED.ordered, updated_at = now()`,
    [a.low, a.out, a.needsReview, a.ordered],
  );
}

/** Chemicals (not containers) whose best container is low or out: one reorder per chemical. */
async function reorderCandidates(db: Db, limit: number): Promise<ReorderItem[]> {
  const rows = await many<{
    id: number;
    chemical_name: string;
    status: StockStatus;
    best_pct: string | null;
    location: string | null;
    alert_priority: AlertPriority | null;
  }>(
    db,
    `SELECT c.id, c.chemical_name, cs.status, cs.best_pct, c.alert_priority,
            (SELECT l.location_name FROM stock_containers sc JOIN storage_locations l ON l.id = sc.storage_location_id
              WHERE sc.chemical_id = c.id AND NOT sc.needs_review ORDER BY sc.remaining_percentage DESC NULLS LAST LIMIT 1) AS location
     FROM chemicals c JOIN chemical_stock cs ON cs.chemical_id = c.id
     WHERE cs.status IN ('low', 'out')
     ORDER BY EXISTS (SELECT 1 FROM reorders r WHERE r.chemical_id = c.id AND r.status = 'ordered'),
              ${PRIORITY_RANK}, cs.best_pct ASC NULLS FIRST, lower(c.chemical_name)
     LIMIT $1`,
    [limit],
  );
  const orders = await openOrdersFor(db, rows.map((r) => r.id));
  return rows.map((r) => ({
    chemicalId: r.id,
    name: r.chemical_name,
    status: r.status,
    bestPct: r.best_pct === null ? null : Number(r.best_pct),
    location: r.location,
    priority: r.alert_priority,
    order: orders.get(r.id) ?? null,
  }));
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(80),
  parentId: z.number().int().nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
});

const slugify = (s: string) =>
  normalizeText(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "category";

export const catalogApi = new Hono()
  .get("/meta", async (c) => {
    const db = await getDb();
    const [t, categories, locations, brands, classes, tags, review] = await Promise.all([
      thresholds(db),
      categoryTree(db),
      many<{ id: number; name: string; description: string | null; chemical_count: number; container_count: number }>(
        db,
        `SELECT l.id, l.location_name AS name, l.description,
                count(DISTINCT sc.chemical_id)::int AS chemical_count, count(sc.id)::int AS container_count
         FROM storage_locations l
         LEFT JOIN stock_containers sc ON sc.storage_location_id = l.id OR (sc.needs_review AND l.location_name = ANY(sc.mentioned_locations))
         GROUP BY l.id ORDER BY l.location_name`,
      ),
      many<{ value: string; count: number }>(
        db,
        `SELECT min(brand) AS value, count(DISTINCT chemical_id)::int AS count FROM stock_containers
         WHERE brand IS NOT NULL GROUP BY lower(brand) ORDER BY count DESC, value`,
      ),
      many<{ value: string; count: number }>(
        db,
        `SELECT chemical_class AS value, count(*)::int AS count FROM chemicals WHERE chemical_class IS NOT NULL
         GROUP BY 1 ORDER BY count DESC, value`,
      ),
      many<{ value: string; count: number }>(
        db,
        `SELECT t.tag_name AS value, count(*)::int AS count FROM chemical_tag_mapping m JOIN chemical_tags t ON t.id = m.tag_id
         GROUP BY t.tag_name ORDER BY count DESC, value LIMIT 80`,
      ),
      one<{ n: number }>(db, "SELECT count(*)::int AS n FROM import_records WHERE import_status = 'needs_review'"),
    ]);
    const meta: MetaResponse = {
      thresholds: t,
      categories,
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        chemicalCount: l.chemical_count,
        containerCount: l.container_count,
      })),
      brands,
      classes,
      tags,
      reviewCount: review!.n,
    };
    return c.json(meta);
  })
  .get("/dashboard", async (c) => {
    const db = await getDb();
    const [stats, attention, recentIds, reorder, expiring, previous] = await Promise.all([
      one<InventoryStats>(db, STATS_SQL),
      one<Attention>(db, ATTENTION_SQL),
      many<{ chemical_id: number }>(
        db,
        "SELECT chemical_id FROM chemical_access_log GROUP BY chemical_id ORDER BY max(accessed_at) DESC LIMIT 5",
      ),
      reorderCandidates(db, 5),
      many<{ id: number; chemical_id: number; chemical_name: string; brand: string | null; location_name: string | null; expiry: string; days_left: number }>(
        db,
        `SELECT sc.id, sc.chemical_id, c.chemical_name, sc.brand, l.location_name,
                to_char(sc.expiry_date, 'YYYY-MM-DD') AS expiry, (sc.expiry_date - current_date)::int AS days_left
         FROM stock_containers sc JOIN chemicals c ON c.id = sc.chemical_id
         LEFT JOIN storage_locations l ON l.id = sc.storage_location_id
         WHERE ${LIVE_EXPIRY} AND sc.expiry_date <= current_date + ${EXPIRY_WINDOW_DAYS}
         ORDER BY sc.expiry_date, lower(c.chemical_name) LIMIT 5`,
      ),
      one<{ day: string; n: number }>(
        db,
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, (low + out + needs_review)::int AS n FROM count_snapshots
         WHERE day < current_date ORDER BY day DESC LIMIT 1`,
      ),
    ]);
    await recordSnapshot(db, attention!);
    const res: DashboardResponse = {
      stats: stats!,
      attention: attention!,
      trend: previous
        ? { attentionDelta: attention!.low + attention!.out + attention!.needsReview - previous.n, since: previous.day }
        : { attentionDelta: null, since: null },
      recent: await listByIds(db, recentIds.map((r) => r.chemical_id)),
      reorder,
      expiring: expiring.map((e) => ({
        containerId: e.id,
        chemicalId: e.chemical_id,
        name: e.chemical_name,
        brand: e.brand,
        location: e.location_name,
        expiryDate: e.expiry,
        daysLeft: e.days_left,
      })),
    };
    return c.json(res);
  })
  .get("/insights", async (c) => {
    const db = await getDb();
    await recordSnapshot(db, (await one<Attention>(db, ATTENTION_SQL))!);
    const [stats, categoryDistribution, statusDistribution, weekly, topSearches, history] = await Promise.all([
      one<InventoryStats>(db, STATS_SQL),
      many<{ slug: string; name: string; color: string; count: number }>(
        db,
        `SELECT top.slug, top.category_name AS name, top.color, count(DISTINCT c.id)::int AS count
         FROM chemicals c JOIN categories pc ON pc.id = c.primary_category_id
         JOIN categories top ON top.id = coalesce(pc.parent_category_id, pc.id)
         GROUP BY top.id ORDER BY count DESC`,
      ),
      many<{ status: StockStatus; count: number }>(db, "SELECT status, count(*)::int AS count FROM chemical_stock GROUP BY status"),
      many<{ week: string; updates: number; added: number }>(
        db,
        `SELECT to_char(w, 'YYYY-MM-DD') AS week,
                (SELECT count(*)::int FROM activity_log a WHERE a.created_at >= w AND a.created_at < w + interval '7 days'
                   AND a.action IN ('availability_updated', 'marked_unavailable', 'location_changed', 'container_updated')) AS updates,
                (SELECT count(*)::int FROM activity_log a WHERE a.created_at >= w AND a.created_at < w + interval '7 days'
                   AND a.action IN ('container_added', 'chemical_created')) AS added
         FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w
         ORDER BY w`,
      ),
      many<{ query: string; n: number }>(
        db,
        `SELECT min(query) AS query, count(*)::int AS n FROM search_history
         WHERE searched_at > now() - interval '30 days' GROUP BY normalized ORDER BY n DESC LIMIT 8`,
      ),
      many<InsightsResponse["history"][number]>(
        db,
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, low, out, needs_review AS "needsReview" FROM count_snapshots
         WHERE day > current_date - 30 ORDER BY day`,
      ),
    ]);
    const res: InsightsResponse = { stats: stats!, categoryDistribution, statusDistribution, weeklyActivity: weekly, topSearches, history };
    return c.json(res);
  })
  .get("/reorders", async (c) => {
    const db = await getDb();
    const rows = await many<{ id: number; chemical_name: string; status: StockStatus; best_pct: string | null; alert_priority: AlertPriority | null }>(
      db,
      `SELECT c.id, c.chemical_name, cs.status, cs.best_pct, c.alert_priority
       FROM reorders r JOIN chemicals c ON c.id = r.chemical_id JOIN chemical_stock cs ON cs.chemical_id = c.id
       WHERE r.status = 'ordered' ORDER BY r.expected_on NULLS LAST, r.ordered_on`,
    );
    const orders = await openOrdersFor(db, rows.map((r) => r.id));
    const items: ReorderItem[] = rows.map((r) => ({
      chemicalId: r.id,
      name: r.chemical_name,
      status: r.status,
      bestPct: r.best_pct === null ? null : Number(r.best_pct),
      location: null,
      priority: r.alert_priority,
      order: orders.get(r.id) ?? null,
    }));
    return c.json({ items });
  })
  .get("/alerts", async (c) => {
    const db = await getDb();
    const statuses = (c.req.query("status")?.split(",") ?? ["low", "out"]) as StockStatus[];
    return c.json({ items: await alerts(db, statuses), thresholds: await thresholds(db) });
  })
  .get("/settings", async (c) => c.json({ thresholds: await thresholds(await getDb()) }))
  .put("/settings", async (c) => {
    const db = await getDb();
    const parsed = z
      .object({ goodAbove: z.number().min(1).max(99), lowBelow: z.number().min(1).max(99) })
      .refine((v) => v.lowBelow <= v.goodAbove, { message: "Low-stock threshold must not exceed the good-stock threshold" })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    await db.query("UPDATE settings SET good_above = $1, low_below = $2, updated_at = now() WHERE id = 1", [
      parsed.data.goodAbove,
      parsed.data.lowBelow,
    ]);
    return c.json({ thresholds: await thresholds(db) });
  })
  .get("/search-history", async (c) => {
    const db = await getDb();
    const recent = await many<{ query: string; searched_at: string; result_count: number }>(
      db,
      `SELECT DISTINCT ON (normalized) query, searched_at, result_count FROM search_history
       ORDER BY normalized, searched_at DESC`,
    );
    recent.sort((a, b) => (a.searched_at < b.searched_at ? 1 : -1));
    const popular = await many<{ query: string; n: number }>(
      db,
      `SELECT min(query) AS query, count(*)::int AS n FROM search_history WHERE result_count > 0
       GROUP BY normalized ORDER BY n DESC LIMIT 8`,
    );
    return c.json({ recent: recent.slice(0, 10).map((r) => ({ query: r.query, at: r.searched_at, resultCount: r.result_count })), popular });
  })
  .post("/search-history", async (c) => {
    const db = await getDb();
    const parsed = z.object({ query: z.string().trim().min(1).max(200), resultCount: z.number().int().min(0) }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ ok: false }, 400);
    await db.query("INSERT INTO search_history (query, normalized, result_count) VALUES ($1, $2, $3)", [
      parsed.data.query,
      normalizeText(parsed.data.query),
      parsed.data.resultCount,
    ]);
    return c.json({ ok: true });
  })
  .delete("/search-history", async (c) => {
    const db = await getDb();
    const q = c.req.query("q");
    if (q) await db.query("DELETE FROM search_history WHERE normalized = $1", [normalizeText(q)]);
    else await db.query("DELETE FROM search_history");
    return c.json({ ok: true });
  })
  .post("/categories", async (c) => {
    const db = await getDb();
    const parsed = categorySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    const d = parsed.data;
    const dup = await one(
      db,
      "SELECT 1 FROM categories WHERE lower(category_name) = lower($1) AND parent_category_id IS NOT DISTINCT FROM $2",
      [d.name, d.parentId ?? null],
    );
    if (dup) return c.json({ error: "A category with this name already exists here" }, 409);
    let slug = slugify(d.name);
    if (await one(db, "SELECT 1 FROM categories WHERE slug = $1", [slug])) slug = `${slug}-${Date.now().toString(36)}`;
    const row = await one<{ id: number }>(
      db,
      `INSERT INTO categories (slug, category_name, parent_category_id, description, color, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, 1000) RETURNING id`,
      [slug, d.name, d.parentId ?? null, d.description ?? null, d.parentId ? null : (d.color ?? "#5E7A8C"), d.parentId ? null : (d.icon ?? "package")],
    );
    return c.json({ id: row!.id, slug }, 201);
  })
  .patch("/categories/:id", async (c) => {
    const db = await getDb();
    const parsed = categorySchema.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    const d = parsed.data;
    await db.query(
      `UPDATE categories SET category_name = coalesce($2, category_name), description = coalesce($3, description),
         color = coalesce($4, color), icon = coalesce($5, icon) WHERE id = $1`,
      [Number(c.req.param("id")), d.name ?? null, d.description ?? null, d.color ?? null, d.icon ?? null],
    );
    return c.json({ ok: true });
  })
  .delete("/categories/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const cat = await one<{ slug: string }>(db, "SELECT slug FROM categories WHERE id = $1", [id]);
    if (!cat) return c.json({ error: "Category not found" }, 404);
    if (cat.slug === "unclassified") return c.json({ error: "The Unclassified category cannot be deleted" }, 400);
    await db.transaction(async (tx) => {
      // Chemicals left with no category fall back to Unclassified rather than disappearing from browse views.
      const orphans = await many<{ chemical_id: number }>(
        tx,
        `SELECT cc.chemical_id FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id
         WHERE cat.id = $1 OR cat.parent_category_id = $1
         GROUP BY cc.chemical_id
         HAVING count(*) = (SELECT count(*) FROM chemical_categories x WHERE x.chemical_id = cc.chemical_id)`,
        [id],
      );
      await tx.query("DELETE FROM categories WHERE id = $1", [id]);
      const unc = await one<{ id: number }>(tx, "SELECT id FROM categories WHERE slug = 'unclassified'");
      for (const o of orphans) {
        await tx.query("INSERT INTO chemical_categories VALUES ($1, $2, true, 'manual') ON CONFLICT DO NOTHING", [o.chemical_id, unc!.id]);
        await tx.query("UPDATE chemicals SET primary_category_id = $2 WHERE id = $1", [o.chemical_id, unc!.id]);
      }
      await tx.query(
        `UPDATE chemicals c SET primary_category_id = (SELECT category_id FROM chemical_categories cc WHERE cc.chemical_id = c.id ORDER BY is_primary DESC LIMIT 1)
         WHERE primary_category_id IS NULL`,
      );
    });
    return c.json({ ok: true });
  })
  .get("/locations/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const loc = await one<{ id: number; location_name: string; description: string | null }>(
      db,
      "SELECT * FROM storage_locations WHERE id = $1",
      [id],
    );
    if (!loc) return c.json({ error: "Location not found" }, 404);
    const ids = await many<{ chemical_id: number }>(
      db,
      `SELECT DISTINCT sc.chemical_id FROM stock_containers sc
       WHERE sc.storage_location_id = $1 OR (sc.needs_review AND $2 = ANY(sc.mentioned_locations))`,
      [id, loc.location_name],
    );
    const items = await listByIds(db, ids.map((i) => i.chemical_id));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ id: loc.id, name: loc.location_name, description: loc.description, items });
  })
  .post("/locations", async (c) => {
    const db = await getDb();
    const parsed = z
      .object({ name: z.string().trim().min(1, "Location name is required").max(60), description: z.string().trim().max(300).nullable().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    if (await one(db, "SELECT 1 FROM storage_locations WHERE lower(location_name) = lower($1)", [parsed.data.name])) {
      return c.json({ error: "This location already exists" }, 409);
    }
    const row = await one<{ id: number }>(db, "INSERT INTO storage_locations (location_name, description) VALUES ($1, $2) RETURNING id", [
      parsed.data.name,
      parsed.data.description ?? null,
    ]);
    return c.json({ id: row!.id }, 201);
  })
  .patch("/locations/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = z
      .object({ name: z.string().trim().min(1).max(60).optional(), description: z.string().trim().max(300).nullable().optional() })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    const old = await one<{ location_name: string }>(db, "SELECT location_name FROM storage_locations WHERE id = $1", [id]);
    if (!old) return c.json({ error: "Location not found" }, 404);
    if (parsed.data.name && parsed.data.name.toLowerCase() !== old.location_name.toLowerCase()) {
      if (await one(db, "SELECT 1 FROM storage_locations WHERE lower(location_name) = lower($1)", [parsed.data.name])) {
        return c.json({ error: "Another location already uses this name" }, 409);
      }
    }
    await db.transaction(async (tx) => {
      if (parsed.data.name) {
        await tx.query("UPDATE storage_locations SET location_name = $2 WHERE id = $1", [id, parsed.data.name]);
        await tx.query(
          "UPDATE stock_containers SET mentioned_locations = array_replace(mentioned_locations, $1, $2) WHERE $1 = ANY(mentioned_locations)",
          [old.location_name, parsed.data.name],
        );
        const affected = await many<{ chemical_id: number }>(
          tx,
          "SELECT DISTINCT chemical_id FROM stock_containers WHERE storage_location_id = $1 OR $2 = ANY(mentioned_locations)",
          [id, parsed.data.name],
        );
        for (const a of affected) await tx.query("SELECT refresh_chemical_search($1)", [a.chemical_id]);
      }
      if (parsed.data.description !== undefined) {
        await tx.query("UPDATE storage_locations SET description = $2 WHERE id = $1", [id, parsed.data.description]);
      }
    });
    return c.json({ ok: true });
  })
  .get("/review", async (c) => {
    const db = await getDb();
    const status = c.req.query("status") ?? "needs_review";
    const rows = await many<{
      id: number;
      original_row: number;
      import_status: string;
      raw_excel_data: unknown;
      validation_notes: unknown;
      chemical_id: number | null;
      chemical_name: string | null;
      file_name: string;
    }>(
      db,
      `SELECT r.id, r.original_row, r.import_status, r.raw_excel_data, r.validation_notes, r.chemical_id,
              c.chemical_name, b.file_name
       FROM import_records r JOIN import_batches b ON b.id = r.batch_id LEFT JOIN chemicals c ON c.id = r.chemical_id
       WHERE r.import_status = ANY($1) ORDER BY r.batch_id, r.original_row`,
      [status.split(",")],
    );
    const counts = await many<{ import_status: string; n: number }>(
      db,
      "SELECT import_status, count(*)::int AS n FROM import_records GROUP BY 1",
    );
    const duplicates = await many<{ cas_number: string; ids: number[]; names: string[] }>(
      db,
      `SELECT min(cas_number) AS cas_number, array_agg(id ORDER BY id) AS ids, array_agg(chemical_name ORDER BY id) AS names
       FROM chemicals WHERE cas_digits IS NOT NULL GROUP BY cas_digits HAVING count(*) > 1 ORDER BY min(lower(chemical_name))`,
    );
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        originalRow: r.original_row,
        status: r.import_status,
        raw: r.raw_excel_data,
        issues: r.validation_notes,
        chemicalId: r.chemical_id,
        chemicalName: r.chemical_name,
        fileName: r.file_name,
      })),
      counts: Object.fromEntries(counts.map((x) => [x.import_status, x.n])),
      duplicates: duplicates.map((d) => ({ cas: d.cas_number, ids: d.ids, names: d.names })),
    });
  });

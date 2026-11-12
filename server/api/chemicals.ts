import { Hono } from "hono";
import { z } from "zod";
import { casDigits, checkCas, formatCas } from "../../shared/cas";
import type { ChemicalDetail, HazardConflict, SearchFilters, SortKey } from "../../shared/types";
import { hazardGroups, incompatibility } from "../../shared/hazard";
import type { StockStatus } from "../../shared/stock";
import { compactName, normalizeLocation } from "../../shared/normalize";
import { parsePackSize } from "../../shared/stock";
import { getDb, many, one, type Db } from "../db";
import {
  addSynonyms,
  casFields,
  chemicalNameFields,
  ensureLocation,
  insertContainer,
  logActivity,
  refreshSearch,
  setCategories,
  setTags,
} from "../repo";
import { listByIds, searchChemicals, suggest } from "../search";
import { pubchem, nameMatchesRecord } from "../enrichment";

const pct = z.number().min(0).max(100).nullable().optional();
const containerSchema = z.object({
  brand: z.string().trim().max(120).nullable().optional(),
  packSize: z.string().trim().max(40).nullable().optional(),
  remainingPercentage: pct,
  location: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must be YYYY-MM-DD")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD");
const casSchema = z
  .string()
  .trim()
  .max(20)
  .nullable()
  .optional()
  .transform((v) => (v ? (formatCas(v) ?? v) : null));

const chemicalSchema = z.object({
  name: z.string().trim().min(1, "Chemical name is required").max(300),
  cas: casSchema,
  formula: z.string().trim().max(80).nullable().optional(),
  molecularWeight: z.number().positive().nullable().optional(),
  chemicalClass: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  hazardClassification: z.string().trim().max(500).nullable().optional(),
  hazardSource: z.string().trim().max(500).nullable().optional(),
});

const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export function parseFilters(query: Record<string, string | undefined>): SearchFilters {
  return {
    categories: list(query.category),
    categoryMode: query.categoryMode === "all" ? "all" : "any",
    brands: list(query.brand),
    statuses: list(query.status) as StockStatus[] | undefined,
    locations: list(query.location),
    classes: query.class ? query.class.split("|").filter(Boolean) : undefined,
    tags: list(query.tag),
  };
}

export async function chemicalDetail(db: Db, id: number): Promise<ChemicalDetail | null> {
  const [base] = await listByIds(db, [id]);
  if (!base) return null;
  const c = await one<{
    iupac_name: string | null;
    molecular_weight: string | null;
    density_g_cm3: string | null;
    phase: "solid" | "liquid" | "gas" | null;
    pubchem_cid: number | null;
    identity_source: string | null;
    classification_source: string;
    hazard_classification: string | null;
    hazard_source: string | null;
    description: string | null;
    notes: string | null;
    cas_digits: string | null;
    created_at: string;
  }>(db, "SELECT * FROM chemicals WHERE id = $1", [id]);
  const [synonyms, tags, records, sameCas, activity] = await Promise.all([
    many<{ id: number; synonym: string; source: string }>(
      db,
      "SELECT id, synonym, source FROM chemical_synonyms WHERE chemical_id = $1 ORDER BY source = 'curated' DESC, source = 'excel' DESC, id",
      [id],
    ),
    many<{ tag_name: string }>(
      db,
      "SELECT t.tag_name FROM chemical_tag_mapping m JOIN chemical_tags t ON t.id = m.tag_id WHERE m.chemical_id = $1 ORDER BY t.tag_name",
      [id],
    ),
    many<{ id: number; original_row: number; import_status: string; raw_excel_data: never; validation_notes: never; resolved_at: string | null; file_name: string }>(
      db,
      `SELECT r.*, b.file_name FROM import_records r JOIN import_batches b ON b.id = r.batch_id
       WHERE r.chemical_id = $1 ORDER BY r.id`,
      [id],
    ),
    c!.cas_digits
      ? many<{ id: number; name: string; container_count: number }>(
          db,
          `SELECT c.id, c.chemical_name AS name, cs.container_count FROM chemicals c JOIN chemical_stock cs ON cs.chemical_id = c.id
           WHERE c.cas_digits = $1 AND c.id <> $2 ORDER BY c.id`,
          [c!.cas_digits, id],
        )
      : Promise.resolve([]),
    many<{ id: number; action: string; detail: Record<string, unknown>; created_at: string }>(
      db,
      "SELECT id, action, detail, created_at FROM activity_log WHERE chemical_id = $1 ORDER BY created_at DESC LIMIT 20",
      [id],
    ),
  ]);
  return {
    ...base,
    iupacName: c!.iupac_name,
    molecularWeight: c!.molecular_weight === null ? null : Number(c!.molecular_weight),
    density: c!.density_g_cm3 === null ? null : Number(c!.density_g_cm3),
    phase: c!.phase,
    pubchemCid: c!.pubchem_cid,
    identitySource: c!.identity_source,
    classificationSource: c!.classification_source,
    hazardClassification: c!.hazard_classification,
    hazardSource: c!.hazard_source,
    description: c!.description,
    notes: c!.notes,
    synonyms,
    tags: tags.map((t) => t.tag_name),
    importRecords: records.map((r) => ({
      id: r.id,
      originalRow: r.original_row,
      status: r.import_status,
      raw: r.raw_excel_data,
      issues: r.validation_notes,
      resolvedAt: r.resolved_at,
      fileName: r.file_name,
    })),
    sameCas: sameCas.map((s) => ({ id: s.id, name: s.name, containerCount: s.container_count })),
    activity: activity.map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.created_at })),
    createdAt: c!.created_at,
  };
}

async function updateContainer(db: Db, containerId: number, input: z.infer<typeof containerSchema>) {
  const sets: string[] = [];
  const params: unknown[] = [containerId];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.brand !== undefined) set("brand", input.brand || null);
  if (input.packSize !== undefined) {
    const p = parsePackSize(input.packSize);
    set("pack_size", input.packSize || null);
    set("pack_size_value", p.value);
    set("pack_size_unit", p.unit);
  }
  if (input.remainingPercentage !== undefined) set("remaining_percentage", input.remainingPercentage);
  if (input.location !== undefined) {
    set("storage_location_id", await ensureLocation(db, input.location));
    set("mentioned_locations", input.location ? [normalizeLocation(input.location)] : []);
  }
  if (input.notes !== undefined) set("notes", input.notes || null);
  if (input.expiryDate !== undefined) set("expiry_date", input.expiryDate || null);
  if (!sets.length) return null;
  return one<{ chemical_id: number }>(
    db,
    `UPDATE stock_containers SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING chemical_id`,
    params,
  );
}

export const chemicalsApi = new Hono()
  .get("/search", async (c) => {
    const db = await getDb();
    const q = c.req.query();
    const res = await searchChemicals(db, {
      q: q.q,
      filters: parseFilters(q),
      sort: (q.sort as SortKey) || undefined,
      limit: q.limit ? Number(q.limit) : 30,
      offset: q.offset ? Number(q.offset) : 0,
    });
    return c.json(res);
  })
  .get("/suggest", async (c) => {
    const db = await getDb();
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ chemicals: [], locations: [], brands: [], categories: [], tookMs: 0 });
    return c.json(await suggest(db, q));
  })
  .get("/chemicals/check-cas", async (c) => {
    const db = await getDb();
    const raw = c.req.query("cas") ?? "";
    const cas = formatCas(raw) ?? raw;
    const check = checkCas(cas);
    const digits = casDigits(cas);
    const matches = digits
      ? await many<{ id: number; name: string; container_count: number }>(
          db,
          `SELECT c.id, c.chemical_name AS name, cs.container_count FROM chemicals c JOIN chemical_stock cs ON cs.chemical_id = c.id
           WHERE c.cas_digits = $1 ORDER BY c.id`,
          [digits],
        )
      : [];
    const pc = check.ok ? (pubchem[check.cas] ?? null) : null;
    return c.json({
      cas: check.cas,
      valid: check.ok,
      reason: check.ok ? null : check.reason,
      existing: matches.map((m) => ({ id: m.id, name: m.name, containerCount: m.container_count })),
      pubchem: pc ? { title: pc.title, formula: pc.formula, mw: pc.mw } : null,
    });
  })
  .get("/chemicals/:id", async (c) => {
    const db = await getDb();
    const detail = await chemicalDetail(db, Number(c.req.param("id")));
    return detail ? c.json(detail) : c.json({ error: "Chemical not found" }, 404);
  })
  .post("/chemicals/:id/access", async (c) => {
    const db = await getDb();
    const body = await c.req.json().catch(() => ({}));
    await db.query("INSERT INTO chemical_access_log (chemical_id, source) VALUES ($1, $2)", [
      Number(c.req.param("id")),
      typeof body.source === "string" ? body.source.slice(0, 20) : "browse",
    ]);
    return c.json({ ok: true });
  })
  .post("/chemicals", async (c) => {
    const db = await getDb();
    const body = await c.req.json();
    const parsed = chemicalSchema
      .extend({
        containers: z.array(containerSchema).max(50).default([]),
        categoryIds: z.array(z.number().int()).default([]),
        primaryCategoryId: z.number().int().nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
        synonyms: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
        allowDuplicateCas: z.boolean().default(false),
      })
      .safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    const input = parsed.data;
    const cas = casFields(input.cas);
    if (cas.cas_digits && !input.allowDuplicateCas) {
      const existing = await many<{ id: number; name: string }>(
        db,
        "SELECT id, chemical_name AS name FROM chemicals WHERE cas_digits = $1",
        [cas.cas_digits],
      );
      if (existing.length) {
        return c.json({ error: "duplicate_cas", message: `CAS ${cas.cas_number} already exists`, existing }, 409);
      }
    }
    const id = await db.transaction(async (tx) => {
      const names = chemicalNameFields(input.name);
      const pc = cas.cas_valid && cas.cas_number ? pubchem[cas.cas_number] : null;
      const verified = pc && nameMatchesRecord(input.name, [pc.title ?? "", pc.iupac ?? "", ...pc.synonyms]) ? pc : null;
      const row = await one<{ id: number }>(
        tx,
        `INSERT INTO chemicals (chemical_name, normalized_name, compact_name, cas_number, cas_digits, cas_valid,
           chemical_formula, molecular_weight, iupac_name, pubchem_cid, identity_source, chemical_class, description, notes,
           hazard_classification, hazard_source, classification_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'manual') RETURNING id`,
        [
          input.name,
          names.normalized,
          names.compact,
          cas.cas_number,
          cas.cas_digits,
          cas.cas_valid,
          input.formula || verified?.formula || null,
          input.molecularWeight ?? verified?.mw ?? null,
          verified?.iupac ?? null,
          verified?.cid ?? null,
          verified && !input.formula ? "PubChem (matched by CAS registry number)" : input.formula ? "Entered manually" : null,
          input.chemicalClass || null,
          input.description || null,
          input.notes || null,
          input.hazardClassification || null,
          input.hazardSource || null,
        ],
      );
      const chemicalId = row!.id;
      let categoryIds = input.categoryIds;
      if (!categoryIds.length) {
        const unc = await one<{ id: number }>(tx, "SELECT id FROM categories WHERE slug = 'unclassified'");
        categoryIds = unc ? [unc.id] : [];
      }
      await setCategories(tx, chemicalId, categoryIds, input.primaryCategoryId ?? null, "manual");
      await setTags(tx, chemicalId, input.tags);
      await addSynonyms(tx, chemicalId, input.synonyms, "manual");
      if (verified) await addSynonyms(tx, chemicalId, verified.synonyms, "pubchem");
      for (const ct of input.containers) await insertContainer(tx, chemicalId, ct);
      await refreshSearch(tx, chemicalId);
      await logActivity(tx, "chemical_created", chemicalId, null, { name: input.name, containers: input.containers.length });
      return chemicalId;
    });
    return c.json(await chemicalDetail(db, id), 201);
  })
  .patch("/chemicals/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = chemicalSchema.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    const input = parsed.data;
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) {
      const n = chemicalNameFields(input.name);
      set("chemical_name", input.name);
      set("normalized_name", n.normalized);
      set("compact_name", n.compact);
    }
    if (input.cas !== undefined) {
      const f = casFields(input.cas);
      set("cas_number", f.cas_number);
      set("cas_digits", f.cas_digits);
      set("cas_valid", f.cas_valid);
    }
    if (input.formula !== undefined) {
      set("chemical_formula", input.formula || null);
      set("identity_source", input.formula ? "Entered manually" : null);
    }
    if (input.molecularWeight !== undefined) set("molecular_weight", input.molecularWeight);
    if (input.chemicalClass !== undefined) set("chemical_class", input.chemicalClass || null);
    if (input.description !== undefined) set("description", input.description || null);
    if (input.notes !== undefined) set("notes", input.notes || null);
    if (input.hazardClassification !== undefined) set("hazard_classification", input.hazardClassification || null);
    if (input.hazardSource !== undefined) set("hazard_source", input.hazardSource || null);
    if (!sets.length) return c.json(await chemicalDetail(db, id));
    await db.transaction(async (tx) => {
      const res = await tx.query(`UPDATE chemicals SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
      if (!res.affectedRows) throw new Error("not found");
      await refreshSearch(tx, id);
      await logActivity(tx, "chemical_updated", id, null, { fields: Object.keys(input) });
    });
    return c.json(await chemicalDetail(db, id));
  })
  .delete("/chemicals/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const row = await one<{ chemical_name: string }>(db, "SELECT chemical_name FROM chemicals WHERE id = $1", [id]);
    if (!row) return c.json({ error: "Chemical not found" }, 404);
    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE import_records SET import_status = 'deleted', validation_notes = validation_notes || $2::jsonb WHERE chemical_id = $1`,
        [id, JSON.stringify([{ level: "warning", code: "record_deleted", message: `Chemical "${row.chemical_name}" was deleted by a user on ${new Date().toISOString().slice(0, 10)}` }])],
      );
      await logActivity(tx, "chemical_deleted", null, null, { id, name: row.chemical_name });
      await tx.query("DELETE FROM chemicals WHERE id = $1", [id]);
    });
    return c.json({ ok: true });
  })
  .put("/chemicals/:id/classification", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = z
      .object({
        categoryIds: z.array(z.number().int()).min(1, "Select at least one category"),
        primaryCategoryId: z.number().int().nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
        chemicalClass: z.string().trim().max(120).nullable().optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    await db.transaction(async (tx) => {
      await setCategories(tx, id, parsed.data.categoryIds, parsed.data.primaryCategoryId ?? null, "manual");
      if (parsed.data.tags) await setTags(tx, id, parsed.data.tags);
      if (parsed.data.chemicalClass !== undefined) {
        await tx.query("UPDATE chemicals SET chemical_class = $2 WHERE id = $1", [id, parsed.data.chemicalClass || null]);
      }
      await tx.query("UPDATE chemicals SET classification_source = 'manual', updated_at = now() WHERE id = $1", [id]);
      await refreshSearch(tx, id);
      await logActivity(tx, "classification_updated", id, null, {});
    });
    return c.json(await chemicalDetail(db, id));
  })
  .post("/chemicals/:id/synonyms", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = z.object({ synonym: z.string().trim().min(1).max(120) }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Synonym is required" }, 400);
    await addSynonyms(db, id, [parsed.data.synonym], "manual");
    await refreshSearch(db, id);
    return c.json(await chemicalDetail(db, id));
  })
  .delete("/synonyms/:id", async (c) => {
    const db = await getDb();
    const row = await one<{ chemical_id: number }>(db, "DELETE FROM chemical_synonyms WHERE id = $1 RETURNING chemical_id", [
      Number(c.req.param("id")),
    ]);
    if (row) await refreshSearch(db, row.chemical_id);
    return c.json({ ok: true });
  })
  .post("/chemicals/:id/containers", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = containerSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid container" }, 400);
    await db.transaction(async (tx) => {
      const containerId = await insertContainer(tx, id, parsed.data);
      await tx.query("UPDATE chemicals SET updated_at = now() WHERE id = $1", [id]);
      await refreshSearch(tx, id);
      await logActivity(tx, "container_added", id, containerId, parsed.data);
    });
    return c.json(await chemicalDetail(db, id), 201);
  })
  .patch("/containers/:id", async (c) => {
    const db = await getDb();
    const containerId = Number(c.req.param("id"));
    const parsed = containerSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid container" }, 400);
    const before = await one<{ remaining_percentage: string | null; location_name: string | null; needs_review: boolean }>(
      db,
      `SELECT sc.remaining_percentage, l.location_name, sc.needs_review FROM stock_containers sc
       LEFT JOIN storage_locations l ON l.id = sc.storage_location_id WHERE sc.id = $1`,
      [containerId],
    );
    if (!before) return c.json({ error: "Container not found" }, 404);
    if (before.needs_review) return c.json({ error: "Resolve this unpaired source row before editing it" }, 409);
    const chemicalId = await db.transaction(async (tx) => {
      const row = await updateContainer(tx, containerId, parsed.data);
      if (!row) return null;
      await refreshSearch(tx, row.chemical_id);
      const action =
        parsed.data.remainingPercentage !== undefined && Object.keys(parsed.data).length === 1
          ? parsed.data.remainingPercentage === 0
            ? "marked_unavailable"
            : "availability_updated"
          : parsed.data.location !== undefined && Object.keys(parsed.data).length === 1
            ? "location_changed"
            : "container_updated";
      await logActivity(tx, action, row.chemical_id, containerId, {
        ...parsed.data,
        previousPercentage: before.remaining_percentage === null ? null : Number(before.remaining_percentage),
        previousLocation: before.location_name,
      });
      return row.chemical_id;
    });
    return chemicalId ? c.json(await chemicalDetail(db, chemicalId)) : c.json({ error: "Nothing to update" }, 400);
  })
  .put("/chemicals/:id/priority", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = z.object({ priority: z.enum(["critical", "watchlist"]).nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Priority must be critical, watchlist or null" }, 400);
    const res = await db.query("UPDATE chemicals SET alert_priority = $2 WHERE id = $1", [id, parsed.data.priority]);
    if (!res.affectedRows) return c.json({ error: "Chemical not found" }, 404);
    await logActivity(db, "priority_changed", id, null, { priority: parsed.data.priority });
    return c.json(await chemicalDetail(db, id));
  })
  .post("/chemicals/:id/reorder", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const parsed = z
      .object({
        supplier: z.string().trim().max(120).nullable().optional(),
        orderedOn: dateSchema.nullable().optional(),
        expectedOn: dateSchema.nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, 400);
    const open = await one(db, "SELECT 1 FROM reorders WHERE chemical_id = $1 AND status = 'ordered'", [id]);
    if (open) return c.json({ error: "This chemical is already on order" }, 409);
    const o = parsed.data;
    await db.query(
      `INSERT INTO reorders (chemical_id, supplier, ordered_on, expected_on, notes) VALUES ($1, $2, coalesce($3::date, current_date), $4, $5)`,
      [id, o.supplier || null, o.orderedOn ?? null, o.expectedOn ?? null, o.notes || null],
    );
    await logActivity(db, "reorder_placed", id, null, { supplier: o.supplier ?? null, expectedOn: o.expectedOn ?? null });
    return c.json(await chemicalDetail(db, id), 201);
  })
  .patch("/reorders/:id", async (c) => {
    const db = await getDb();
    const orderId = Number(c.req.param("id"));
    const parsed = z
      .object({
        status: z.enum(["received", "cancelled"]).optional(),
        supplier: z.string().trim().max(120).nullable().optional(),
        expectedOn: dateSchema.nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid update" }, 400);
    const o = parsed.data;
    const row = await one<{ chemical_id: number }>(
      db,
      `UPDATE reorders SET
         status = coalesce($2, status),
         supplier = CASE WHEN $3::boolean THEN $4 ELSE supplier END,
         expected_on = CASE WHEN $5::boolean THEN $6::date ELSE expected_on END,
         notes = CASE WHEN $7::boolean THEN $8 ELSE notes END,
         closed_at = CASE WHEN $2 IS NOT NULL THEN now() ELSE closed_at END
       WHERE id = $1 AND status = 'ordered' RETURNING chemical_id`,
      [orderId, o.status ?? null, o.supplier !== undefined, o.supplier || null, o.expectedOn !== undefined, o.expectedOn ?? null, o.notes !== undefined, o.notes || null],
    );
    if (!row) return c.json({ error: "Open order not found" }, 404);
    await logActivity(db, o.status ? `reorder_${o.status}` : "reorder_updated", row.chemical_id, null, o);
    return c.json(await chemicalDetail(db, row.chemical_id));
  })
  .get("/chemicals/:id/location-check", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const location = (c.req.query("location") ?? "").trim();
    const me = await one<{ hazard_classification: string | null }>(db, "SELECT hazard_classification FROM chemicals WHERE id = $1", [id]);
    if (!me) return c.json({ error: "Chemical not found" }, 404);
    const neighbours = location
      ? await many<{ id: number; chemical_name: string; hazard_classification: string }>(
          db,
          `SELECT DISTINCT c.id, c.chemical_name, c.hazard_classification
           FROM stock_containers sc JOIN storage_locations l ON l.id = sc.storage_location_id JOIN chemicals c ON c.id = sc.chemical_id
           WHERE lower(l.location_name) = lower($1) AND c.id <> $2 AND c.hazard_classification IS NOT NULL
             AND coalesce(sc.remaining_percentage, 1) > 0`,
          [location, id],
        )
      : [];
    const mine = hazardGroups(me.hazard_classification);
    const conflicts: HazardConflict[] = [];
    for (const n of neighbours) {
      const reason = incompatibility(mine, hazardGroups(n.hazard_classification));
      if (reason) conflicts.push({ chemicalId: n.id, name: n.chemical_name, reason });
    }
    return c.json({ hasVerifiedHazard: !!me.hazard_classification, verifiedNeighbours: neighbours.length, conflicts });
  })
  .delete("/containers/:id", async (c) => {
    const db = await getDb();
    const containerId = Number(c.req.param("id"));
    const row = await one<{ chemical_id: number; brand: string | null; pack_size: string | null }>(
      db,
      "DELETE FROM stock_containers WHERE id = $1 RETURNING chemical_id, brand, pack_size",
      [containerId],
    );
    if (!row) return c.json({ error: "Container not found" }, 404);
    await refreshSearch(db, row.chemical_id);
    await logActivity(db, "container_deleted", row.chemical_id, containerId, { brand: row.brand, packSize: row.pack_size });
    return c.json(await chemicalDetail(db, row.chemical_id));
  })
  .post("/chemicals/:id/merge", async (c) => {
    const db = await getDb();
    const targetId = Number(c.req.param("id"));
    const parsed = z.object({ sourceId: z.number().int() }).safeParse(await c.req.json());
    if (!parsed.success || parsed.data.sourceId === targetId) return c.json({ error: "Choose a different record to merge" }, 400);
    const sourceId = parsed.data.sourceId;
    const source = await one<{ chemical_name: string }>(db, "SELECT chemical_name FROM chemicals WHERE id = $1", [sourceId]);
    if (!source) return c.json({ error: "Source record not found" }, 404);
    await db.transaction(async (tx) => {
      await tx.query("UPDATE stock_containers SET chemical_id = $1, updated_at = now() WHERE chemical_id = $2", [targetId, sourceId]);
      await tx.query("UPDATE import_records SET chemical_id = $1 WHERE chemical_id = $2", [targetId, sourceId]);
      await tx.query(
        `INSERT INTO chemical_synonyms (chemical_id, synonym, normalized, compact, source)
         SELECT $1, synonym, normalized, compact, source FROM chemical_synonyms WHERE chemical_id = $2
         ON CONFLICT DO NOTHING`,
        [targetId, sourceId],
      );
      const target = await one<{ chemical_name: string }>(tx, "SELECT chemical_name FROM chemicals WHERE id = $1", [targetId]);
      if (compactName(target!.chemical_name) !== compactName(source.chemical_name)) {
        await addSynonyms(tx, targetId, [source.chemical_name], "merged");
      }
      await tx.query(
        `INSERT INTO chemical_tag_mapping (chemical_id, tag_id) SELECT $1, tag_id FROM chemical_tag_mapping WHERE chemical_id = $2 ON CONFLICT DO NOTHING`,
        [targetId, sourceId],
      );
      await tx.query("UPDATE chemical_access_log SET chemical_id = $1 WHERE chemical_id = $2", [targetId, sourceId]);
      await tx.query("UPDATE activity_log SET chemical_id = $1 WHERE chemical_id = $2", [targetId, sourceId]);
      await tx.query(
        `UPDATE reorders SET status = 'cancelled', closed_at = now(), notes = concat_ws(' ', notes, '(duplicate order closed on merge)')
         WHERE chemical_id = $2 AND status = 'ordered' AND EXISTS (SELECT 1 FROM reorders WHERE chemical_id = $1 AND status = 'ordered')`,
        [targetId, sourceId],
      );
      await tx.query("UPDATE reorders SET chemical_id = $1 WHERE chemical_id = $2", [targetId, sourceId]);
      await tx.query(
        "UPDATE chemicals SET alert_priority = coalesce(alert_priority, (SELECT alert_priority FROM chemicals WHERE id = $2)) WHERE id = $1",
        [targetId, sourceId],
      );
      await tx.query("DELETE FROM chemicals WHERE id = $1", [sourceId]);
      await tx.query("UPDATE chemicals SET updated_at = now() WHERE id = $1", [targetId]);
      await refreshSearch(tx, targetId);
      await logActivity(tx, "records_merged", targetId, null, { mergedName: source.chemical_name, mergedId: sourceId });
    });
    return c.json(await chemicalDetail(db, targetId));
  })
  .post("/import-records/:id/resolve", async (c) => {
    const db = await getDb();
    const recordId = Number(c.req.param("id"));
    const parsed = z.object({ containers: z.array(containerSchema).min(1, "Add at least one container").max(50) }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    const record = await one<{ chemical_id: number; original_row: number }>(
      db,
      "SELECT chemical_id, original_row FROM import_records WHERE id = $1",
      [recordId],
    );
    if (!record?.chemical_id) return c.json({ error: "Import record not found" }, 404);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM stock_containers WHERE import_record_id = $1 AND needs_review", [recordId]);
      for (const ct of parsed.data.containers) {
        await insertContainer(tx, record.chemical_id, ct, { sourceRow: record.original_row, importRecordId: recordId });
      }
      await tx.query(
        `UPDATE import_records SET import_status = 'resolved', resolved_at = now(),
           validation_notes = validation_notes || $2::jsonb WHERE id = $1`,
        [recordId, JSON.stringify([{ level: "warning", code: "manually_resolved", message: `Split into ${parsed.data.containers.length} containers by manual review` }])],
      );
      await refreshSearch(tx, record.chemical_id);
      await logActivity(tx, "review_resolved", record.chemical_id, null, { containers: parsed.data.containers.length, row: record.original_row });
    });
    return c.json(await chemicalDetail(db, record.chemical_id));
  })
  .post("/chemicals/:id/pubchem", async (c) => {
    // Live PubChem lookup for chemicals added after the initial import.
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const chem = await one<{ chemical_name: string; cas_number: string | null; cas_valid: boolean }>(
      db,
      "SELECT chemical_name, cas_number, cas_valid FROM chemicals WHERE id = $1",
      [id],
    );
    if (!chem?.cas_number || !chem.cas_valid) return c.json({ error: "A valid CAS number is required for PubChem lookup" }, 400);
    const base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
    try {
      const cidRes = await fetch(`${base}/compound/name/${chem.cas_number}/cids/JSON`, { signal: AbortSignal.timeout(10000) });
      if (!cidRes.ok) return c.json({ error: "No PubChem record lists this CAS number" }, 404);
      const cid = (await cidRes.json()).IdentifierList?.CID?.[0];
      const [propRes, synRes] = await Promise.all([
        fetch(`${base}/compound/cid/${cid}/property/Title,MolecularFormula,MolecularWeight,IUPACName/JSON`, { signal: AbortSignal.timeout(10000) }),
        fetch(`${base}/compound/cid/${cid}/synonyms/JSON`, { signal: AbortSignal.timeout(10000) }),
      ]);
      const p = (await propRes.json()).PropertyTable.Properties[0];
      const syns: string[] = (await synRes.json()).InformationList?.Information?.[0]?.Synonym ?? [];
      if (!syns.includes(chem.cas_number)) return c.json({ error: "PubChem could not confirm this CAS number" }, 404);
      if (!nameMatchesRecord(chem.chemical_name, [p.Title, p.IUPACName, ...syns.slice(0, 60)])) {
        return c.json({ error: `PubChem lists ${chem.cas_number} as "${p.Title}", which does not match this chemical name. Nothing was changed.` }, 409);
      }
      await db.transaction(async (tx) => {
        await tx.query(
          `UPDATE chemicals SET chemical_formula = $2, molecular_weight = $3, iupac_name = $4, pubchem_cid = $5,
             identity_source = 'PubChem (matched by CAS registry number)', updated_at = now() WHERE id = $1`,
          [id, p.MolecularFormula, Number(p.MolecularWeight), p.IUPACName, cid],
        );
        const clean = syns.filter((s) => s.length <= 48 && !/^\d+-\d+-\d$/.test(s) && !/(UNII|EINECS|NSC|CHEMBL|DTXSID|MFCD|SCHEMBL|AKOS)/i.test(s)).slice(0, 14);
        await addSynonyms(tx, id, clean, "pubchem");
        await refreshSearch(tx, id);
        await logActivity(tx, "pubchem_enriched", id, null, { cid });
      });
      return c.json(await chemicalDetail(db, id));
    } catch {
      return c.json({ error: "PubChem could not be reached. Try again when online." }, 502);
    }
  });

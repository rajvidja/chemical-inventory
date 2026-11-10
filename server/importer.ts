import { rowStatus, type ParsedRow, type RowIssue } from "../shared/importParse";
import { compactName } from "../shared/normalize";
import { many, one, type Db } from "./db";
import { enrichmentFor } from "./enrichment";
import {
  addSynonyms,
  casFields,
  categoryIdsBySlug,
  chemicalNameFields,
  insertContainer,
  logActivity,
  refreshSearch,
  setCategories,
  setTags,
} from "./repo";

export type RowDecision = { mode: "new" } | { mode: "append"; chemicalId: number } | { mode: "skip" };

export interface ImportSummary {
  batchId: number;
  rows: number;
  chemicalsCreated: number;
  appendedToExisting: number;
  skipped: number;
  containersCreated: number;
  needsReview: number;
  withWarnings: number;
}

function identityIssues(row: ParsedRow, rejected: { title: string | null; cid: number } | null): RowIssue[] {
  if (!rejected) return [];
  return [
    {
      level: "warning",
      code: "cas_name_mismatch",
      field: "cas",
      message: `PubChem lists CAS ${row.cas.cas} as "${rejected.title}", which does not match "${row.name}". Formula, structure and classification were not applied – verify the CAS number.`,
    },
  ];
}

/** Writes parsed rows to the database. Every row is recorded in import_records, including skipped ones. */
export async function commitRows(
  db: Db,
  rows: ParsedRow[],
  opts: { fileName: string; kind: "seed" | "upload"; decisions?: Map<number, RowDecision> },
): Promise<ImportSummary> {
  const batch = await one<{ id: number }>(
    db,
    "INSERT INTO import_batches (file_name, kind, row_count) VALUES ($1, $2, $3) RETURNING id",
    [opts.fileName, opts.kind, rows.length],
  );
  const batchId = batch!.id;
  const catIds = await categoryIdsBySlug(db);
  const summary: ImportSummary = {
    batchId,
    rows: rows.length,
    chemicalsCreated: 0,
    appendedToExisting: 0,
    skipped: 0,
    containersCreated: 0,
    needsReview: 0,
    withWarnings: 0,
  };

  for (const row of rows) {
    const decision = opts.decisions?.get(row.raw.rowNumber) ?? { mode: "new" };
    const cas = casFields(row.raw.cas);
    const enrich = enrichmentFor(row.name, cas.cas_number, cas.cas_valid);
    const issues = [...row.issues, ...identityIssues(row, enrich.identityRejected)];
    let status: string = rowStatus({ ...row, issues });

    if (decision.mode === "skip" || status === "error") {
      await db.query(
        `INSERT INTO import_records (batch_id, original_row, raw_excel_data, import_status, validation_notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [batchId, row.raw.rowNumber, JSON.stringify(row.raw), status === "error" ? "error" : "skipped", JSON.stringify(issues)],
      );
      summary.skipped++;
      continue;
    }

    let chemicalId: number;
    if (decision.mode === "append") {
      chemicalId = decision.chemicalId;
      const existing = await one<{ chemical_name: string }>(db, "SELECT chemical_name FROM chemicals WHERE id = $1", [chemicalId]);
      if (!existing) throw new Error(`Target chemical ${chemicalId} not found`);
      if (compactName(existing.chemical_name) !== compactName(row.name)) {
        await addSynonyms(db, chemicalId, [row.name], "import");
      }
      summary.appendedToExisting++;
    } else {
      const names = chemicalNameFields(row.name);
      const id = enrich.identity;
      const created = await one<{ id: number }>(
        db,
        `INSERT INTO chemicals (chemical_name, normalized_name, compact_name, cas_number, cas_digits, cas_valid,
            chemical_formula, molecular_weight, iupac_name, pubchem_cid, identity_source, chemical_class, classification_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          row.name,
          names.normalized,
          names.compact,
          cas.cas_number,
          cas.cas_digits,
          cas.cas_valid,
          id?.formula ?? null,
          id?.mw ?? null,
          id?.iupac ?? null,
          id?.cid ?? null,
          id ? "PubChem (matched by CAS registry number)" : null,
          enrich.classification?.chemical_class ?? null,
          enrich.classification?.source ?? "unclassified",
        ],
      );
      chemicalId = created!.id;
      summary.chemicalsCreated++;

      const cls = enrich.classification;
      const slugs = cls?.categories.filter((s) => catIds.has(s)) ?? [];
      const categoryIds = (slugs.length ? slugs : ["unclassified"]).map((s) => catIds.get(s)!);
      await setCategories(db, chemicalId, categoryIds, categoryIds[0], cls?.source ?? "unclassified");
      if (cls?.tags.length) await setTags(db, chemicalId, cls.tags);
      if (cls?.synonyms.length) await addSynonyms(db, chemicalId, cls.synonyms, "curated");
      if (id?.synonyms.length) await addSynonyms(db, chemicalId, id.synonyms, "pubchem");
      // keep parenthetical abbreviations from the sheet, e.g. "Dichloromethane(DCM)"
      const paren = [...row.name.matchAll(/\(([A-Za-z][A-Za-z0-9\- ]{1,12})\)/g)].map((m) => m[1]);
      if (paren.length) await addSynonyms(db, chemicalId, paren, "excel");
    }

    if (status === "needs_review") summary.needsReview++;
    else if (status === "imported_with_warnings") summary.withWarnings++;

    const record = await one<{ id: number }>(
      db,
      `INSERT INTO import_records (batch_id, original_row, raw_excel_data, import_status, validation_notes, chemical_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [batchId, row.raw.rowNumber, JSON.stringify(row.raw), status, JSON.stringify(issues), chemicalId],
    );
    const recordId = record!.id;

    if (row.pairing === "ambiguous") {
      await db.query(
        `INSERT INTO stock_containers (chemical_id, needs_review, raw_brand, raw_pack_size, raw_availability, raw_location,
            mentioned_locations, notes, source_excel_row, import_record_id)
         VALUES ($1, true, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          chemicalId,
          row.raw.brand,
          row.raw.quantity,
          row.raw.available,
          row.raw.location,
          row.mentionedLocations,
          `Unpaired values from source row ${row.raw.rowNumber}; split into containers during review.`,
          row.raw.rowNumber,
          recordId,
        ],
      );
      summary.containersCreated++;
    } else {
      for (const c of row.containers) {
        await insertContainer(
          db,
          chemicalId,
          { brand: c.brand, packSize: c.packSize, remainingPercentage: c.percentage, location: c.location },
          { sourceRow: row.raw.rowNumber, importRecordId: recordId },
        );
        summary.containersCreated++;
      }
    }
    await refreshSearch(db, chemicalId);
  }

  await db.query("UPDATE import_batches SET summary = $2 WHERE id = $1", [batchId, JSON.stringify(summary)]);
  if (opts.kind === "upload") await logActivity(db, "import", null, null, { ...summary, fileName: opts.fileName });
  return summary;
}

/** Finds existing chemicals sharing a CAS number with incoming rows. */
export async function findCasMatches(db: Db, casDigitsList: string[]) {
  if (!casDigitsList.length) return new Map<string, { id: number; chemical_name: string; cas_number: string }[]>();
  const rows = await many<{ id: number; chemical_name: string; cas_number: string; cas_digits: string }>(
    db,
    "SELECT id, chemical_name, cas_number, cas_digits FROM chemicals WHERE cas_digits = ANY($1) ORDER BY id",
    [casDigitsList],
  );
  const map = new Map<string, { id: number; chemical_name: string; cas_number: string }[]>();
  for (const r of rows) {
    const list = map.get(r.cas_digits) ?? [];
    list.push(r);
    map.set(r.cas_digits, list);
  }
  return map;
}

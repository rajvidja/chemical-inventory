/**
 * Data-integrity check: imports the source spreadsheet into a throwaway database and verifies that
 * every row is accounted for and every original value survives somewhere in the database.
 * Also runs search smoke tests from the acceptance criteria.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "chemstock-verify-"));
process.env.CHEMSTOCK_DATA_DIR = tmp;

const { getDb, many, one, closeDb, ROOT } = await import("../server/db");
const { seedIfEmpty, SOURCE_FILE } = await import("../server/seed");
const { readWorkbook } = await import("../server/readWorkbook");
const { searchChemicals } = await import("../server/search");
const { tokenize } = await import("../shared/importParse");

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

try {
  const db = await getDb();
  await db.transaction((tx) => seedIfEmpty(tx));
  const source = readWorkbook(readFileSync(path.join(ROOT, "data", SOURCE_FILE))).rows;

  const records = await many<{ original_row: number; raw_excel_data: Record<string, string | null>; chemical_id: number | null; import_status: string }>(
    db,
    "SELECT original_row, raw_excel_data, chemical_id, import_status FROM import_records ORDER BY original_row",
  );
  check(source.length === 622, `source sheet has 622 data rows (found ${source.length})`);
  check(records.length === source.length, `every source row has an import record (${records.length}/${source.length})`);
  check(records.every((r) => r.chemical_id !== null), "every import record is linked to a chemical");

  const byRow = new Map(records.map((r) => [r.original_row, r]));
  let rawMismatch = 0;
  for (const s of source) {
    const r = byRow.get(s.rowNumber);
    for (const k of ["name", "cas", "brand", "quantity", "available", "location"] as const) {
      if ((r?.raw_excel_data[k] ?? null) !== (s[k] ?? null)) rawMismatch++;
    }
  }
  check(rawMismatch === 0, `raw cell values preserved byte-for-byte in import_records (${rawMismatch} mismatches)`);

  const names = await many<{ original_row: number; chemical_name: string; cas_number: string | null }>(
    db,
    "SELECT r.original_row, c.chemical_name, c.cas_number FROM import_records r JOIN chemicals c ON c.id = r.chemical_id",
  );
  const nameOk = names.every((n) => {
    const s = source.find((x) => x.rowNumber === n.original_row)!;
    return n.chemical_name === s.name && (n.cas_number ?? null) === (s.cas ?? null);
  });
  check(nameOk, "chemical names and CAS numbers stored exactly as in the sheet");

  // Every container value in a reliably-paired row must exist as a container field.
  const containers = await many<{ source_excel_row: number; brand: string | null; pack_size: string | null; remaining_percentage: string | null; location_name: string | null; needs_review: boolean; raw_location: string | null }>(
    db,
    `SELECT sc.source_excel_row, sc.brand, sc.pack_size, sc.remaining_percentage, l.location_name, sc.needs_review, sc.raw_location
     FROM stock_containers sc LEFT JOIN storage_locations l ON l.id = sc.storage_location_id`,
  );
  let lost = 0;
  for (const s of source) {
    const mine = containers.filter((c) => c.source_excel_row === s.rowNumber);
    if (!mine.length) {
      lost++;
      continue;
    }
    if (mine.some((m) => m.needs_review)) {
      if (mine[0].raw_location !== s.location) lost++;
      continue;
    }
    const expectCount = (cell: string | null) => tokenize(cell).reduce((n, t) => n + t.count, 0);
    const n = Math.max(1, expectCount(s.brand), expectCount(s.quantity), expectCount(s.available), expectCount(s.location));
    if (mine.length !== n) lost++;
    const locs = tokenize(s.location).flatMap((t) => Array(t.count).fill(t.value)).sort();
    const got = mine.map((m) => m.location_name ?? "").filter(Boolean).sort();
    if (JSON.stringify(locs) !== JSON.stringify(got)) lost++;
  }
  check(lost === 0, `container counts and locations reconcile with the sheet for every row (${lost} problems)`);

  const review = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM import_records WHERE import_status = 'needs_review'");
  console.log(`      ${review!.n} rows flagged for manual container pairing`);

  const s = async (q: string) => (await searchChemicals(db, { q, limit: 10 })).items;
  const top = async (q: string, expect: RegExp) => {
    const items = await s(q);
    check(items.slice(0, 3).some((i) => expect.test(i.name)), `search "${q}" → ${items[0]?.name ?? "(none)"} [${items[0]?.match?.field}]`);
  };
  await top("Acetonitrile", /acetonitrile/i);
  await top("Acetoni", /acetonitrile/i);
  await top("Aceton", /aceton/i);
  await top("DMF", /dimethylformamide/i);
  await top("DMSO", /dimethyl sulfoxide/i);
  await top("THF", /tetrahydrofuran/i);
  await top("DCM", /dichloromethane/i);
  await top("67-68-5", /dimethyl sulfoxide/i);
  await top("67685", /dimethyl sulfoxide/i);
  await top("toulene", /tol|toul/i);
  await top("acetonitril", /acetonitrile/i);
  await top("2 chloro benzaldehyde", /chlorobenzaldehyde/i);
  await top("Finar", /./);
  const r1 = await s("R1");
  check(r1.length > 0 && r1.every((i) => i.match?.field === "location"), `search "R1" returns location matches (${r1.length})`);
  const r1All = (await searchChemicals(db, { q: "R1", limit: 200 })).items;
  check(
    r1All.every((i) => i.containers.some((c) => c.location === "R1" || c.mentionedLocations.includes("R1"))),
    `every "R1" result has a container in R1 (${r1All.length} chemicals)`,
  );
  const c4 = (await searchChemicals(db, { q: "C4", limit: 200 })).items;
  check(c4.some((i) => /acetonitrile/i.test(i.name)), `search "C4" includes Acetonitrile (unpaired review row)`);
  const solvents = (await searchChemicals(db, { filters: { categories: ["organic-solvents"] }, limit: 200 })).items;
  check(solvents.length > 15, `category filter "Organic Solvents" → ${solvents.length} chemicals`);
  const multi = (await searchChemicals(db, { filters: { categories: ["organic-solvents", "bases"], categoryMode: "all" }, limit: 200 })).items;
  check(multi.some((i) => /pyridine/i.test(i.name)), `multi-category (solvent AND base) includes pyridine (${multi.length})`);
  const t0 = performance.now();
  for (const q of ["ac", "acet", "methyl", "2-amino", "chloro", "spectro"]) await s(q);
  console.log(`      avg search latency ${(Math.round((performance.now() - t0) / 6))} ms (embedded PGlite)`);
} finally {
  await closeDb();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

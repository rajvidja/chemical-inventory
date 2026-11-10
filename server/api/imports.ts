import { Hono } from "hono";
import * as XLSX from "xlsx";
import { z } from "zod";
import { casDigits } from "../../shared/cas";
import { parseRow, rowStatus, type ParsedRow } from "../../shared/importParse";
import { STATUS_LABEL, type StockStatus } from "../../shared/stock";
import { getDb, many } from "../db";
import { commitRows, findCasMatches, type RowDecision } from "../importer";
import { readWorkbook } from "../readWorkbook";

const MAX_BYTES = 10 * 1024 * 1024;
const previews = new Map<string, { fileName: string; rows: ParsedRow[]; createdAt: number }>();

function prunePreviews() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, v] of previews) if (v.createdAt < cutoff) previews.delete(k);
}

export const importsApi = new Hono()
  .post("/import/preview", async (c) => {
    prunePreviews();
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Choose an XLSX or CSV file" }, 400);
    if (file.size > MAX_BYTES) return c.json({ error: "File is larger than 10 MB" }, 413);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return c.json({ error: "Only .xlsx, .xls and .csv files are supported" }, 400);
    let read;
    try {
      read = readWorkbook(Buffer.from(await file.arrayBuffer()));
    } catch {
      return c.json({ error: "The file could not be read as a spreadsheet" }, 400);
    }
    if (read.missingColumns.length) {
      return c.json(
        { error: `Missing required column: ${read.missingColumns.join(", ")}. Found columns: ${read.headers.join(", ") || "none"}` },
        400,
      );
    }
    const parsed = read.rows.map(parseRow);
    const db = await getDb();
    const digits = parsed.map((p) => (p.cas.cas ? casDigits(p.cas.cas) : "")).filter(Boolean);
    const existing = await findCasMatches(db, [...new Set(digits)]);
    const seenInFile = new Map<string, number>();
    const token = crypto.randomUUID();
    previews.set(token, { fileName: file.name, rows: parsed, createdAt: Date.now() });

    const rows = parsed.map((p) => {
      const d = p.cas.cas ? casDigits(p.cas.cas) : "";
      const matches = d ? (existing.get(d) ?? []) : [];
      const firstInFile = d ? seenInFile.get(d) : undefined;
      if (d && firstInFile === undefined) seenInFile.set(d, p.raw.rowNumber);
      return {
        rowNumber: p.raw.rowNumber,
        raw: p.raw,
        name: p.name,
        cas: p.cas.cas,
        casValid: p.cas.ok,
        pairing: p.pairing,
        containers: p.containers,
        issues: p.issues,
        status: rowStatus(p),
        existingMatches: matches.map((m) => ({ id: m.id, name: m.chemical_name })),
        duplicateOfRow: firstInFile ?? null,
      };
    });
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return c.json({
      token,
      fileName: file.name,
      sheetName: read.sheetName,
      headers: read.headers,
      rows,
      summary: {
        total: rows.length,
        clean: count("imported"),
        warnings: count("imported_with_warnings"),
        review: count("needs_review"),
        errors: count("error"),
        existingDuplicates: rows.filter((r) => r.existingMatches.length).length,
        containers: rows.reduce((n, r) => n + (r.pairing === "ambiguous" ? 1 : r.containers.length), 0),
      },
    });
  })
  .post("/import/commit", async (c) => {
    const parsed = z
      .object({
        token: z.string(),
        decisions: z
          .record(
            z.string(),
            z.union([
              z.object({ mode: z.literal("new") }),
              z.object({ mode: z.literal("skip") }),
              z.object({ mode: z.literal("append"), chemicalId: z.number().int() }),
            ]),
          )
          .default({}),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid import request" }, 400);
    const preview = previews.get(parsed.data.token);
    if (!preview) return c.json({ error: "This preview has expired. Upload the file again." }, 410);
    const decisions = new Map<number, RowDecision>(Object.entries(parsed.data.decisions).map(([k, v]) => [Number(k), v as RowDecision]));
    const db = await getDb();
    const summary = await db.transaction((tx) => commitRows(tx, preview.rows, { fileName: preview.fileName, kind: "upload", decisions }));
    previews.delete(parsed.data.token);
    return c.json(summary);
  })
  .get("/import/batches", async (c) => {
    const db = await getDb();
    const rows = await many(db, "SELECT id, file_name, kind, row_count, summary, imported_at FROM import_batches ORDER BY imported_at DESC");
    return c.json({ items: rows });
  })
  .get("/export", async (c) => {
    const db = await getDb();
    const format = c.req.query("format") === "csv" ? "csv" : "xlsx";
    const rows = await many<{
      chemical_id: number;
      chemical_name: string;
      cas_number: string | null;
      chemical_formula: string | null;
      primary_category: string | null;
      categories: string | null;
      chemical_class: string | null;
      brand: string | null;
      pack_size: string | null;
      remaining_percentage: string | null;
      remaining_quantity: string | null;
      pack_size_unit: string | null;
      location_name: string | null;
      needs_review: boolean;
      raw_brand: string | null;
      raw_pack_size: string | null;
      raw_availability: string | null;
      raw_location: string | null;
      status: StockStatus | null;
      notes: string | null;
      expiry: string | null;
      source_excel_row: number | null;
    }>(
      db,
      `SELECT c.id AS chemical_id, c.chemical_name, c.cas_number, c.chemical_formula, pc.category_name AS primary_category,
              (SELECT string_agg(cat.category_name, '; ' ORDER BY cc.is_primary DESC, cat.category_name)
                 FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id WHERE cc.chemical_id = c.id) AS categories,
              c.chemical_class, sc.brand, sc.pack_size, sc.remaining_percentage, sc.remaining_quantity, sc.pack_size_unit,
              l.location_name, sc.needs_review, sc.raw_brand, sc.raw_pack_size, sc.raw_availability, sc.raw_location,
              CASE WHEN sc.id IS NULL THEN NULL WHEN sc.needs_review THEN 'review' ELSE stock_status(sc.remaining_percentage) END AS status,
              concat_ws(' | ', c.notes, sc.notes) AS notes, to_char(sc.expiry_date, 'YYYY-MM-DD') AS expiry, sc.source_excel_row
       FROM chemicals c
       LEFT JOIN stock_containers sc ON sc.chemical_id = c.id
       LEFT JOIN storage_locations l ON l.id = sc.storage_location_id
       LEFT JOIN categories pc ON pc.id = c.primary_category_id
       ORDER BY lower(c.chemical_name), c.id, sc.id`,
    );
    const data = rows.map((r, i) => ({
      "Sr. No.": i + 1,
      "Chemical Name": r.chemical_name,
      "CAS No.": r.cas_number ?? "",
      Brand: r.needs_review ? (r.raw_brand ?? "") : (r.brand ?? ""),
      Quantity: r.needs_review ? (r.raw_pack_size ?? "") : (r.pack_size ?? ""),
      "Available (%)": r.needs_review ? (r.raw_availability ?? "") : r.remaining_percentage === null ? "" : Number(r.remaining_percentage),
      "Storage Location": r.needs_review ? (r.raw_location ?? "") : (r.location_name ?? ""),
      "Expiry Date": r.expiry ?? "",
      "Estimated Remaining": r.remaining_quantity === null ? "" : `${Math.round(Number(r.remaining_quantity) * 10) / 10} ${r.pack_size_unit ?? ""}`.trim(),
      "Stock Status": r.status ? STATUS_LABEL[r.status] : "",
      "Primary Category": r.primary_category ?? "",
      Categories: r.categories ?? "",
      "Chemical Class": r.chemical_class ?? "",
      Formula: r.chemical_formula ?? "",
      Notes: r.notes ?? "",
      "Source Excel Row": r.source_excel_row ?? "",
      "ChemStock ID": r.chemical_id,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [6, 40, 14, 18, 12, 12, 14, 12, 16, 14, 26, 40, 26, 14, 30, 10, 10].map((wch) => ({ wch }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws);
      return new Response("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="chemstock-inventory-${stamp}.csv"`,
        },
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="chemstock-inventory-${stamp}.xlsx"`,
      },
    });
  });

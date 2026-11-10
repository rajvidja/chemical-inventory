import * as XLSX from "xlsx";
import { mapHeaders, type RawRow } from "../shared/importParse";

export interface WorkbookReadResult {
  rows: RawRow[];
  headers: string[];
  missingColumns: string[];
  sheetName: string;
}

/** Reads the first sheet of an XLSX/CSV buffer using displayed cell text so values are not reinterpreted. */
export function readWorkbook(buffer: Buffer | ArrayBuffer | Uint8Array): WorkbookReadResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, raw: false, defval: null, blankrows: false });
  const [headerRow = [], ...body] = grid;
  const headers = headerRow.map((h) => String(h ?? "").trim());
  const { map, missing } = mapHeaders(headers);
  const cell = (r: (string | null)[], key: keyof typeof map) => {
    const idx = map[key];
    if (idx === undefined) return null;
    const v = r[idx];
    return v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
  };
  const rows: RawRow[] = body.map((r, i) => ({
    rowNumber: i + 2,
    srNo: cell(r, "srNo"),
    name: cell(r, "name"),
    cas: cell(r, "cas"),
    brand: cell(r, "brand"),
    quantity: cell(r, "quantity"),
    available: cell(r, "available"),
    location: cell(r, "location"),
  }));
  return { rows, headers, missingColumns: missing, sheetName };
}

import { checkCas, type CasCheck } from "./cas";
import { normalizeLocation } from "./normalize";
import { parsePackSize } from "./stock";

/** One spreadsheet row exactly as read from the source file (cell text, not reinterpreted). */
export interface RawRow {
  rowNumber: number;
  srNo: string | null;
  name: string | null;
  cas: string | null;
  brand: string | null;
  quantity: string | null;
  available: string | null;
  location: string | null;
}

export interface ParsedContainer {
  brand: string | null;
  packSize: string | null;
  packValue: number | null;
  packUnit: string | null;
  percentage: number | null;
  location: string | null;
}

export type IssueLevel = "error" | "review" | "warning";

export interface RowIssue {
  level: IssueLevel;
  code: string;
  field?: keyof RawRow;
  message: string;
}

export type Pairing = "single" | "paired" | "ambiguous";

export interface ParsedRow {
  raw: RawRow;
  name: string;
  cas: CasCheck;
  pairing: Pairing;
  /** Reliable per-container records. Empty when pairing is ambiguous. */
  containers: ParsedContainer[];
  /** Every location / brand mentioned in the row, kept searchable even when unpaired. */
  mentionedLocations: string[];
  mentionedBrands: string[];
  issues: RowIssue[];
}

interface Token {
  value: string;
  count: number;
  explicitCount: boolean;
}

/** Splits "Finar(3), SRL(2)" into [{Finar,3},{SRL,2}]. */
export function tokenize(cell: string | null): Token[] {
  if (cell === null || cell === undefined) return [];
  return String(cell)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(.*?)\s*\((\d+)\)$/);
      if (m && m[1]) return { value: m[1].trim(), count: Number(m[2]), explicitCount: true };
      return { value: t, count: 1, explicitCount: false };
    });
}

function expand(tokens: Token[]): string[] {
  return tokens.flatMap((t) => Array.from({ length: t.count }, () => t.value));
}

export function parsePercentage(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

const clean = (v: string | null) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

export function parseRow(input: RawRow): ParsedRow {
  const raw: RawRow = {
    ...input,
    srNo: clean(input.srNo),
    name: clean(input.name),
    cas: clean(input.cas),
    brand: clean(input.brand),
    quantity: clean(input.quantity),
    available: clean(input.available),
    location: clean(input.location),
  };
  const issues: RowIssue[] = [];
  const name = raw.name ?? "";
  if (!name) issues.push({ level: "error", code: "name_missing", field: "name", message: "Chemical name is missing" });

  const cas = checkCas(raw.cas);
  if (!cas.ok) {
    const message =
      cas.reason === "missing"
        ? "CAS number is missing"
        : cas.reason === "format"
          ? `CAS number "${raw.cas}" is not in NNNNNNN-NN-N format`
          : `CAS number "${raw.cas}" fails the CAS check-digit test (possible typo)`;
    issues.push({ level: "warning", code: `cas_${cas.reason}`, field: "cas", message });
  }

  const fields = {
    brand: tokenize(raw.brand),
    quantity: tokenize(raw.quantity),
    available: tokenize(raw.available),
    location: tokenize(raw.location),
  };
  const expanded = {
    brand: expand(fields.brand),
    quantity: expand(fields.quantity),
    available: expand(fields.available),
    location: expand(fields.location).map(normalizeLocation),
  };

  const mentionedLocations = [...new Set(expanded.location)];
  const mentionedBrands = [...new Set(expanded.brand)];

  const missingLabel: Record<keyof typeof fields, string> = {
    brand: "Brand",
    quantity: "Pack size",
    available: "Available (%)",
    location: "Storage location",
  };
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (expanded[key].length === 0) {
      issues.push({ level: "warning", code: `${key}_missing`, field: key, message: `${missingLabel[key]} is empty` });
    }
  }

  const n = Math.max(1, ...Object.values(expanded).map((v) => v.length));
  let pairing: Pairing = n === 1 ? "single" : "paired";
  const conflicts: string[] = [];

  // A field is usable for n containers if it lists exactly n values, is empty, or is a single
  // value written once (brand / pack size only – a lone percentage or location is not assumed
  // to apply to every container).
  const resolve = (key: keyof typeof fields, broadcastable: boolean): (string | null)[] => {
    const values = expanded[key];
    if (values.length === n) return values;
    if (values.length === 0) return Array(n).fill(null);
    if (values.length === 1 && !fields[key][0].explicitCount && broadcastable) return Array(n).fill(values[0]);
    conflicts.push(`${missingLabel[key]} lists ${values.length}`);
    return Array(n).fill(null);
  };

  const brands = resolve("brand", true);
  const quantities = resolve("quantity", true);
  const percents = resolve("available", false);
  const locations = resolve("location", false);

  let containers: ParsedContainer[] = [];
  if (conflicts.length) {
    pairing = "ambiguous";
    issues.push({
      level: "review",
      code: "ambiguous_containers",
      message: `Cannot reliably pair container values: ${n} containers implied, but ${conflicts.join(", ")}. Original values preserved for manual review.`,
    });
  } else {
    containers = Array.from({ length: n }, (_, i) => {
      const pack = parsePackSize(quantities[i]);
      return {
        brand: brands[i],
        packSize: quantities[i],
        packValue: pack.value,
        packUnit: pack.unit,
        percentage: percents[i] === null ? null : parsePercentage(percents[i]!),
        location: locations[i],
      };
    });
    const unitless = [...new Set(containers.filter((c) => c.packSize && !c.packUnit).map((c) => c.packSize))];
    for (const size of unitless) {
      issues.push({
        level: "warning",
        code: "pack_unit_missing",
        field: "quantity",
        message: `Pack size "${size}" has no unit`,
      });
    }
    containers.forEach((c, i) => {
      if (percents[i] !== null && c.percentage === null) {
        issues.push({
          level: "warning",
          code: "percentage_invalid",
          field: "available",
          message: `Availability "${percents[i]}" is not a percentage between 0 and 100`,
        });
      }
    });
  }

  return { raw, name, cas, pairing, containers, mentionedLocations, mentionedBrands, issues };
}

export function rowStatus(row: ParsedRow): "imported" | "imported_with_warnings" | "needs_review" | "error" {
  if (row.issues.some((i) => i.level === "error")) return "error";
  if (row.issues.some((i) => i.level === "review")) return "needs_review";
  if (row.issues.length) return "imported_with_warnings";
  return "imported";
}

export const SOURCE_COLUMNS = {
  srNo: ["sr. no.", "sr no", "sr. no", "s.no", "sno", "serial", "#"],
  name: ["chemical name", "name", "chemical"],
  cas: ["cas no.", "cas no", "cas", "cas number", "cas#"],
  brand: ["brand", "manufacturer", "supplier"],
  quantity: ["quantity", "pack size", "pack", "size"],
  available: ["available (%)", "available", "availability", "available %", "remaining (%)", "remaining"],
  location: ["storage location", "location", "storage"],
} as const satisfies Record<Exclude<keyof RawRow, "rowNumber">, readonly string[]>;

/** Maps a header row to RawRow keys. Returns missing required columns. */
export function mapHeaders(headers: string[]) {
  const map: Partial<Record<keyof typeof SOURCE_COLUMNS, number>> = {};
  headers.forEach((h, idx) => {
    const key = String(h ?? "").trim().toLowerCase();
    for (const [field, aliases] of Object.entries(SOURCE_COLUMNS)) {
      if ((aliases as readonly string[]).includes(key) && map[field as keyof typeof SOURCE_COLUMNS] === undefined) {
        map[field as keyof typeof SOURCE_COLUMNS] = idx;
      }
    }
  });
  const missing = (["name"] as const).filter((k) => map[k] === undefined);
  return { map, missing };
}

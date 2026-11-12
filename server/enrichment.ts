import { compactName } from "../shared/normalize";
import { loadDataJson } from "./dataFiles";

export interface PubchemRecord {
  cid: number;
  title: string | null;
  formula: string | null;
  mw: number | null;
  iupac: string | null;
  smiles: string | null;
  /** g/cm³ from PubChem experimental data. Null when PubChem reports none. */
  density?: number | null;
  /** Phase at 25 °C, from melting and boiling points. */
  phase?: "solid" | "liquid" | "gas" | null;
  cas_confirmed: boolean;
  synonyms: string[];
  match_names?: string[];
}

export interface ClassificationRecord {
  categories: string[];
  chemical_class: string | null;
  tags: string[];
  synonyms: string[];
  source: "curated" | "structure" | "unclassified";
  mixture: boolean;
}

export const pubchem = loadDataJson<PubchemRecord | null>("pubchem.json");
export const classification = loadDataJson<ClassificationRecord>("classification.json");

function trigrams(s: string) {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function trigramSimilarity(a: string, b: string) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared || 1);
}

function levenshteinRatio(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * True when the spreadsheet name plausibly refers to the same substance as the PubChem record
 * for its CAS number (tolerating spelling variants, abbreviations and grade suffixes).
 */
export function nameMatchesRecord(name: string, candidates: string[]): boolean {
  const n = compactName(name);
  if (!n) return false;
  return candidates.some((cand) => {
    const c = compactName(cand);
    if (!c) return false;
    if (c === n) return true;
    if (c.length >= 4 && n.length >= 4 && (n.includes(c) || c.includes(n))) return true;
    return trigramSimilarity(n, c) >= 0.45 || levenshteinRatio(n, c) >= 0.7;
  });
}

export interface Enrichment {
  identity: PubchemRecord | null;
  identityRejected: { title: string | null; cid: number } | null;
  classification: ClassificationRecord | null;
}

/** Looks up cached PubChem identity and classification for a CAS, verifying the name matches. */
export function enrichmentFor(name: string, cas: string | null, casValid: boolean): Enrichment {
  if (!cas || !casValid) return { identity: null, identityRejected: null, classification: null };
  const record = pubchem[cas] ?? null;
  const cls = classification[cas] ?? null;
  if (!record || !record.cas_confirmed) {
    return { identity: null, identityRejected: null, classification: cls?.source === "curated" ? cls : null };
  }
  const candidates = [
    record.title ?? "",
    record.iupac ?? "",
    ...(record.match_names ?? record.synonyms),
    ...(cls?.synonyms ?? []),
  ];
  if (!nameMatchesRecord(name, candidates)) {
    return { identity: null, identityRejected: { title: record.title, cid: record.cid }, classification: null };
  }
  const identity = cls?.mixture ? { ...record, formula: null, mw: null, smiles: null, density: null, phase: null } : record;
  return { identity, identityRejected: null, classification: cls };
}

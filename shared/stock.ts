export type StockStatus = "good" | "moderate" | "low" | "out" | "unknown" | "review";

export interface Thresholds {
  /** Percentages strictly above this are Good stock. */
  goodAbove: number;
  /** Percentages strictly below this (and above 0) are Low stock. */
  lowBelow: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { goodAbove: 50, lowBelow: 20 };

export function stockStatus(pct: number | null | undefined, t: Thresholds = DEFAULT_THRESHOLDS): StockStatus {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "unknown";
  if (pct <= 0) return "out";
  if (pct < t.lowBelow) return "low";
  if (pct <= t.goodAbove) return "moderate";
  return "good";
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  good: "Good stock",
  moderate: "Moderate",
  low: "Low stock",
  out: "Out of stock",
  unknown: "Not recorded",
  review: "Needs review",
};

export interface PackSize {
  value: number | null;
  unit: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  ml: "mL", l: "L", g: "g", kg: "kg", mg: "mg", ltr: "L", gm: "g", gms: "g",
};

export function parsePackSize(raw: string | null | undefined): PackSize {
  const m = (raw ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
  if (!m) return { value: null, unit: null };
  const unit = m[2] ? UNIT_ALIASES[m[2].toLowerCase()] ?? m[2] : null;
  return { value: Number(m[1]), unit };
}

export function formatQuantity(value: number | null, unit: string | null): string | null {
  if (value === null || !unit) return null;
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

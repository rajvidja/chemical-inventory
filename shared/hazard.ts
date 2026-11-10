/**
 * Storage-compatibility groups derived ONLY from a chemical's verified hazard classification text
 * (GHS H-codes or explicit wording entered with a source). Never from the chemical name.
 */
export type HazardGroup = "oxidizer" | "flammable" | "water_reactive" | "acid" | "base";

export const HAZARD_GROUP_LABEL: Record<HazardGroup, string> = {
  oxidizer: "oxidizer",
  flammable: "flammable",
  water_reactive: "water-reactive",
  acid: "acid",
  base: "base",
};

const RULES: [HazardGroup, RegExp][] = [
  ["oxidizer", /\bH27[012]\b|oxidi[sz]/i],
  ["flammable", /\bH22[0-8]\b|\bH24[12]\b|\bH25[01]\b|flammable|pyrophoric/i],
  ["water_reactive", /\bH26[01]\b|\bEUH014\b|water[- ]reactive|reacts violently with water/i],
  ["acid", /\bacid(ic)?\b/i],
  ["base", /\b(base|alkali(ne)?|caustic)\b/i],
];

const INCOMPATIBLE: [HazardGroup, HazardGroup][] = [
  ["oxidizer", "flammable"],
  ["acid", "base"],
  ["water_reactive", "acid"],
  ["water_reactive", "base"],
];

export function hazardGroups(verifiedHazard: string | null | undefined): HazardGroup[] {
  if (!verifiedHazard) return [];
  return RULES.filter(([, re]) => re.test(verifiedHazard)).map(([g]) => g);
}

/** Returns e.g. "oxidizer next to flammable", or null when the two are compatible as far as verified data shows. */
export function incompatibility(a: HazardGroup[], b: HazardGroup[]): string | null {
  for (const [x, y] of INCOMPATIBLE) {
    if (a.includes(x) && b.includes(y)) return `${HAZARD_GROUP_LABEL[x]} next to ${HAZARD_GROUP_LABEL[y]}`;
    if (a.includes(y) && b.includes(x)) return `${HAZARD_GROUP_LABEL[y]} next to ${HAZARD_GROUP_LABEL[x]}`;
  }
  return null;
}

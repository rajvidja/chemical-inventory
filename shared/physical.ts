/** Room temperature used for the phase call, in °C. */
export const ROOM_C = 25;

export type Phase = "solid" | "liquid" | "gas";

export const PHASE_LABEL: Record<Phase, string> = { solid: "Solid", liquid: "Liquid", gas: "Gas" };

/**
 * Phase at 25 °C from measured temperatures. Above the melting point and below the boiling point is
 * liquid; above the boiling point is gas; below the melting point is solid.
 */
export function phaseAtRoom(meltingC: number | null, boilingC: number | null): Phase | null {
  if (meltingC != null && meltingC > ROOM_C) return "solid";
  if (boilingC != null && boilingC < ROOM_C) return "gas";
  if (meltingC != null && meltingC <= ROOM_C && (boilingC == null || boilingC >= ROOM_C)) return "liquid";
  return null;
}

export function formatDensity(gPerCm3: number) {
  const text = gPerCm3.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${text} g/cm³`;
}

export const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

export function casDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Formats a digit-only or loosely written CAS number as NNNNNNN-NN-N. */
export function formatCas(value: string): string | null {
  const d = casDigits(value);
  if (d.length < 5 || d.length > 10) return null;
  return `${d.slice(0, -3)}-${d.slice(-3, -1)}-${d.slice(-1)}`;
}

/** CAS check digit: weighted sum of the digits (right to left, weights 1..n) mod 10. */
export function isValidCasChecksum(cas: string): boolean {
  if (!CAS_PATTERN.test(cas)) return false;
  const d = casDigits(cas);
  const body = d.slice(0, -1);
  const check = Number(d.slice(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i + 1);
  return sum % 10 === check;
}

export type CasCheck =
  | { ok: true; cas: string }
  | { ok: false; cas: string | null; reason: "missing" | "format" | "checksum" };

export function checkCas(raw: string | null | undefined): CasCheck {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, cas: null, reason: "missing" };
  if (!CAS_PATTERN.test(value)) return { ok: false, cas: value, reason: "format" };
  if (!isValidCasChecksum(value)) return { ok: false, cas: value, reason: "checksum" };
  return { ok: true, cas: value };
}

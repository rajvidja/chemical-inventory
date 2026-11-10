/** Lower-case, accent-free, single-spaced text used for display-insensitive comparisons. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Separator-free form of a chemical name so that "2 chlorobenzaldehyde", "2-Chlorobenzaldehyde"
 * and "2-chloro benzaldehyde" all compare equal.
 */
export function compactName(value: string | null | undefined): string {
  return normalizeText(value).replace(/[\s\-_,.'()\[\]{}:;/\\+]/g, "");
}

export function normalizeLocation(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

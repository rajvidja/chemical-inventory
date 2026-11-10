import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./db";

/** Reads a JSON lookup table from data/, or an empty table when the file is missing. */
export function loadDataJson<T>(file: string): Record<string, T> {
  const p = path.join(ROOT, "data", file);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

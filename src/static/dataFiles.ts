import classification from "../../data/classification.json?raw";
import pubchem from "../../data/pubchem.json?raw";

const FILES: Record<string, string> = { "pubchem.json": pubchem, "classification.json": classification };

/** Static-build replacement for server/dataFiles.ts: the tables are bundled instead of read from disk. */
export function loadDataJson<T>(file: string): Record<string, T> {
  return FILES[file] ? JSON.parse(FILES[file]) : {};
}

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { applyPhysicalProperties } from "../../server/physical";
import { SCHEMA_SQL } from "../../server/schema";

/** Static-build replacement for server/db.ts: the database lives in this browser's IndexedDB. */
export type Db = PGlite | Transaction;

export const ROOT = "/";
export const DATA_DIR = "idb://chemstock";
export const SEED_URL = "/chemstock-seed.tar.gz";
const IDB_NAME = "/pglite/chemstock";

let instance: Promise<PGlite> | null = null;

async function hasLocalDb() {
  if (!indexedDB.databases) return localStorage.getItem("chemstock.static-db") === "1";
  return (await indexedDB.databases()).some((d) => d.name === IDB_NAME);
}

async function open() {
  const fresh = !(await hasLocalDb());
  const loadDataDir = fresh ? await fetch(SEED_URL).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`Could not load the inventory (${r.status})`)))) : undefined;
  const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pg_trgm }, loadDataDir });
  await db.exec(SCHEMA_SQL);
  await applyPhysicalProperties(db);
  localStorage.setItem("chemstock.static-db", "1");
  void navigator.storage?.persist?.();
  return db;
}

export function getDb(): Promise<PGlite> {
  return (instance ??= open());
}

export async function closeDb() {
  if (instance) await (await instance).close();
  instance = null;
}

export async function many<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const res = await db.query<T>(sql, params);
  return res.rows[0] ?? null;
}

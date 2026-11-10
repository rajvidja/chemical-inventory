import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { SCHEMA_SQL } from "./schema";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = process.env.CHEMSTOCK_DATA_DIR ?? path.join(ROOT, ".data", "pgdata");

export type Db = PGlite | Transaction;

let instance: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (instance) return instance;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pg_trgm } });
  await db.exec(SCHEMA_SQL);
  instance = db;
  return db;
}

export async function closeDb() {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

export async function many<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const res = await db.query<T>(sql, params);
  return res.rows[0] ?? null;
}

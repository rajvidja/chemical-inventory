import { pubchem } from "./enrichment";

type Queryable = { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

/** Copies density and phase from the PubChem cache onto verified chemicals that don't have them yet. */
export async function applyPhysicalProperties(db: Queryable) {
  const res = await db.query<{ id: number; cas_number: string }>(
    `SELECT id, cas_number FROM chemicals
     WHERE pubchem_cid IS NOT NULL AND cas_number IS NOT NULL AND (density_g_cm3 IS NULL OR phase IS NULL)`,
  );
  for (const row of res.rows) {
    const rec = pubchem[row.cas_number];
    if (!rec?.cas_confirmed || (rec.density == null && rec.phase == null)) continue;
    await db.query(`UPDATE chemicals SET density_g_cm3 = COALESCE(density_g_cm3, $2), phase = COALESCE(phase, $3) WHERE id = $1`, [
      row.id,
      rec.density ?? null,
      rec.phase ?? null,
    ]);
  }
}

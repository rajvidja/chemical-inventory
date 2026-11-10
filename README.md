# ChemStock

Mobile-first chemical inventory with fast, typo-tolerant search. No login: the app opens straight to the dashboard.

## Run

```bash
npm install
npm run dev          # API on :8787 + web on http://localhost:5173
```

On first start the server imports `data/Chemical Inventory - Merged_updated.xlsx` (all 622 rows) into an embedded PostgreSQL database in `.data/pgdata`. Later starts reuse that database; nothing is re-imported.

Production:

```bash
npm run build && npm start   # serves the built app and API on :8787 (PORT to override)
```

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript check for app, server and scripts |
| `npm run test:import` | Seeds a temporary DB and verifies every source row, raw value, container count and search behaviour |
| `npm run test:api` | Exercises every write endpoint. Run against a throwaway instance: `CHEMSTOCK_DATA_DIR=/tmp/chem-test PORT=8799 npx tsx server/index.ts`, then `BASE=http://localhost:8799 npm run test:api` |
| `npm run db:reset` | Deletes the local database (the spreadsheet is re-imported on next start) |

## Data handling

- Original cell text for every row is stored in `import_records.raw_excel_data`, with the source row number on every container.
- Multi-value cells (e.g. `Finar(3), SRL(2)`) become separate containers only when brand, pack size, percentage and location counts line up exactly. Otherwise the row is kept as one "needs review" record with its raw values. These rows are listed under **Data review** and can be paired manually.
- Rows that share a CAS number stay as separate records (some are different grades). They are listed for optional merging.
- Formula, molecular weight and IUPAC name come from PubChem only when the CID's synonyms contain the CAS number *and* the name matches. Hazard data is never inferred and is only shown when entered with a source.
- Classification uses a curated CAS → reagent-role table plus RDKit functional-group detection (`scripts/classify.py`). Anything uncertain is filed under **Unclassified**.

## Static website

`npm run build:static` builds a version that needs no server: the same API routes and PostgreSQL schema run inside the browser (PGlite in IndexedDB). The build also writes `dist/chemstock-seed.tar.gz`, a ready-made database created from `data/Chemical Inventory - Merged_updated.xlsx`, which each browser loads on its first visit. Host `dist/` on any static host with a fallback of all paths to `index.html`.

- Edits are saved in that browser only; other people and devices start from the spreadsheet. Use **Export** to keep a copy.
- Clearing the site's data in the browser resets it to the spreadsheet.
- After the first visit the site works offline.

## Deploy on Render

`render.yaml` sets up the **static website** above: **New → Blueprint**, pick this repository, apply. Manual setup: **New → Static Site**, build command `npm install --include=dev && npm run build:static`, publish directory `dist`, and a rewrite rule `/*` → `/index.html`.

To run the shared server version instead (one database for everyone), create a **Web Service** with build command `npm install --include=dev && npm run build` and start command `npm start`. It needs a persistent disk with `CHEMSTOCK_DATA_DIR` pointing at it, or the database resets on every deploy.

## Stack

React 19, Vite, Tailwind v4, TanStack Query, Hono, PGlite (Postgres + `pg_trgm` + full-text search), installable PWA. The schema in `server/schema.ts` is plain PostgreSQL, so it can be moved to a hosted Postgres (e.g. Supabase) by swapping the PGlite connection in `server/db.ts`.

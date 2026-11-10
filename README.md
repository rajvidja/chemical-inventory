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

## Deploy on Render

`render.yaml` describes a Node **Web Service** (not a Static Site, which cannot run the API). In Render choose **New → Blueprint**, pick this repository and apply. Manual setup uses build command `npm install --include=dev && npm run build` and start command `npm start`; the server reads `PORT` and serves `dist/` itself. On first start the database is built from `data/Chemical Inventory - Merged_updated.xlsx`. Without a persistent disk (free plan) the database resets on every deploy or restart; with a disk, set `CHEMSTOCK_DATA_DIR` to a folder on it (see the comments in `render.yaml`).

## Stack

React 19, Vite, Tailwind v4, TanStack Query, Hono, PGlite (Postgres + `pg_trgm` + full-text search), installable PWA. The schema in `server/schema.ts` is plain PostgreSQL, so it can be moved to a hosted Postgres (e.g. Supabase) by swapping the PGlite connection in `server/db.ts`.

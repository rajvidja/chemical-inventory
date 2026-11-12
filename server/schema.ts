export const SCHEMA_SQL = /* sql */ `
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS settings (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  good_above    numeric NOT NULL DEFAULT 50,
  low_below     numeric NOT NULL DEFAULT 20,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (low_below > 0 AND low_below <= good_above AND good_above < 100)
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS categories (
  id                  serial PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  category_name       text NOT NULL,
  parent_category_id  int REFERENCES categories(id) ON DELETE CASCADE,
  description         text,
  icon                text,
  color               text,
  sort_order          int NOT NULL DEFAULT 0,
  is_system           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories(parent_category_id);
CREATE INDEX IF NOT EXISTS categories_name_trgm ON categories USING gin (lower(category_name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS storage_locations (
  id             serial PRIMARY KEY,
  location_name  text NOT NULL,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storage_locations_name_uq ON storage_locations (lower(location_name));

CREATE TABLE IF NOT EXISTS chemicals (
  id                     serial PRIMARY KEY,
  chemical_name          text NOT NULL,
  normalized_name        text NOT NULL,
  compact_name           text NOT NULL,
  cas_number             text,
  cas_digits             text,
  cas_valid              boolean NOT NULL DEFAULT false,
  chemical_formula       text,
  molecular_weight       numeric,
  iupac_name             text,
  pubchem_cid            int,
  identity_source        text,
  primary_category_id    int REFERENCES categories(id) ON DELETE SET NULL,
  chemical_class         text,
  classification_source  text NOT NULL DEFAULT 'unclassified',
  hazard_classification  text,
  hazard_source          text,
  description            text,
  notes                  text,
  search_vector          tsvector,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
-- CAS is intentionally not UNIQUE: the source sheet holds distinct products (e.g. silica grades)
-- that share a CAS number. Duplicates are detected and offered for merge instead.
CREATE INDEX IF NOT EXISTS chemicals_cas_digits_idx ON chemicals(cas_digits);
CREATE INDEX IF NOT EXISTS chemicals_cas_trgm ON chemicals USING gin (cas_digits gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chemicals_name_trgm ON chemicals USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chemicals_compact_trgm ON chemicals USING gin (compact_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chemicals_fts ON chemicals USING gin (search_vector);
CREATE INDEX IF NOT EXISTS chemicals_primary_cat_idx ON chemicals(primary_category_id);

CREATE TABLE IF NOT EXISTS chemical_categories (
  chemical_id  int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  category_id  int NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  source       text NOT NULL DEFAULT 'manual',
  PRIMARY KEY (chemical_id, category_id)
);
CREATE INDEX IF NOT EXISTS chemical_categories_cat_idx ON chemical_categories(category_id);

CREATE TABLE IF NOT EXISTS chemical_tags (
  id        serial PRIMARY KEY,
  tag_name  text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chemical_tags_name_uq ON chemical_tags (lower(tag_name));

CREATE TABLE IF NOT EXISTS chemical_tag_mapping (
  chemical_id  int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  tag_id       int NOT NULL REFERENCES chemical_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (chemical_id, tag_id)
);
CREATE INDEX IF NOT EXISTS chemical_tag_mapping_tag_idx ON chemical_tag_mapping(tag_id);

CREATE TABLE IF NOT EXISTS chemical_synonyms (
  id            serial PRIMARY KEY,
  chemical_id   int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  synonym       text NOT NULL,
  normalized    text NOT NULL,
  compact       text NOT NULL,
  source        text NOT NULL DEFAULT 'manual',
  UNIQUE (chemical_id, normalized)
);
CREATE INDEX IF NOT EXISTS chemical_synonyms_trgm ON chemical_synonyms USING gin (normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chemical_synonyms_compact_trgm ON chemical_synonyms USING gin (compact gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chemical_synonyms_chem_idx ON chemical_synonyms(chemical_id);

CREATE TABLE IF NOT EXISTS import_batches (
  id           serial PRIMARY KEY,
  file_name    text NOT NULL,
  kind         text NOT NULL DEFAULT 'upload',
  row_count    int NOT NULL,
  summary      jsonb NOT NULL DEFAULT '{}',
  imported_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_records (
  id                serial PRIMARY KEY,
  batch_id          int REFERENCES import_batches(id) ON DELETE CASCADE,
  original_row      int NOT NULL,
  raw_excel_data    jsonb NOT NULL,
  import_status     text NOT NULL,
  validation_notes  jsonb NOT NULL DEFAULT '[]',
  chemical_id       int REFERENCES chemicals(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_records_chem_idx ON import_records(chemical_id);
CREATE INDEX IF NOT EXISTS import_records_status_idx ON import_records(import_status);

CREATE TABLE IF NOT EXISTS stock_containers (
  id                    serial PRIMARY KEY,
  chemical_id           int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  brand                 text,
  pack_size             text,
  pack_size_value       numeric,
  pack_size_unit        text,
  remaining_percentage  numeric CHECK (remaining_percentage IS NULL OR (remaining_percentage >= 0 AND remaining_percentage <= 100)),
  remaining_quantity    numeric GENERATED ALWAYS AS (pack_size_value * remaining_percentage / 100) STORED,
  storage_location_id   int REFERENCES storage_locations(id) ON DELETE SET NULL,
  needs_review          boolean NOT NULL DEFAULT false,
  raw_brand             text,
  raw_pack_size         text,
  raw_availability      text,
  raw_location          text,
  mentioned_locations   text[] NOT NULL DEFAULT '{}',
  notes                 text,
  source_excel_row      int,
  import_record_id      int REFERENCES import_records(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_containers_chem_idx ON stock_containers(chemical_id);
CREATE INDEX IF NOT EXISTS stock_containers_loc_idx ON stock_containers(storage_location_id);
CREATE INDEX IF NOT EXISTS stock_containers_brand_trgm ON stock_containers USING gin (lower(brand) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS stock_containers_mentioned_idx ON stock_containers USING gin (mentioned_locations);
CREATE INDEX IF NOT EXISTS stock_containers_updated_idx ON stock_containers(updated_at DESC);

CREATE TABLE IF NOT EXISTS search_history (
  id            serial PRIMARY KEY,
  query         text NOT NULL,
  normalized    text NOT NULL,
  result_count  int NOT NULL DEFAULT 0,
  searched_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_history_time_idx ON search_history(searched_at DESC);

CREATE TABLE IF NOT EXISTS chemical_access_log (
  id           serial PRIMARY KEY,
  chemical_id  int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'browse',
  accessed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chemical_access_log_chem_idx ON chemical_access_log(chemical_id, accessed_at DESC);

CREATE TABLE IF NOT EXISTS activity_log (
  id            serial PRIMARY KEY,
  chemical_id   int REFERENCES chemicals(id) ON DELETE SET NULL,
  container_id  int,
  action        text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_time_idx ON activity_log(created_at DESC);

ALTER TABLE stock_containers ADD COLUMN IF NOT EXISTS expiry_date date;
CREATE INDEX IF NOT EXISTS stock_containers_expiry_idx ON stock_containers(expiry_date) WHERE expiry_date IS NOT NULL;
ALTER TABLE chemicals ADD COLUMN IF NOT EXISTS alert_priority text CHECK (alert_priority IN ('critical', 'watchlist'));
ALTER TABLE chemicals ADD COLUMN IF NOT EXISTS density_g_cm3 numeric;
ALTER TABLE chemicals ADD COLUMN IF NOT EXISTS phase text CHECK (phase IN ('solid', 'liquid', 'gas'));

-- One open order per chemical; received/cancelled rows are kept as history.
CREATE TABLE IF NOT EXISTS reorders (
  id           serial PRIMARY KEY,
  chemical_id  int NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'received', 'cancelled')),
  supplier     text,
  ordered_on   date NOT NULL DEFAULT current_date,
  expected_on  date,
  notes        text,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reorders_open_uq ON reorders(chemical_id) WHERE status = 'ordered';

CREATE TABLE IF NOT EXISTS count_snapshots (
  day          date PRIMARY KEY,
  low          int NOT NULL,
  out          int NOT NULL,
  needs_review int NOT NULL,
  ordered      int NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION stock_status(p numeric) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p IS NULL THEN 'unknown'
    WHEN p <= 0 THEN 'out'
    WHEN p < s.low_below THEN 'low'
    WHEN p <= s.good_above THEN 'moderate'
    ELSE 'good' END
  FROM settings s WHERE s.id = 1
$$;

CREATE OR REPLACE VIEW chemical_stock AS
SELECT
  c.id AS chemical_id,
  count(sc.id)::int AS container_count,
  (count(sc.id) FILTER (WHERE sc.needs_review))::int AS review_count,
  max(sc.remaining_percentage) FILTER (WHERE NOT sc.needs_review) AS best_pct,
  CASE
    WHEN count(sc.id) = 0 THEN 'unknown'
    WHEN bool_and(sc.needs_review) THEN 'review'
    ELSE stock_status(max(sc.remaining_percentage) FILTER (WHERE NOT sc.needs_review))
  END AS status
FROM chemicals c
LEFT JOIN stock_containers sc ON sc.chemical_id = c.id
GROUP BY c.id;

CREATE OR REPLACE FUNCTION refresh_chemical_search(cid int) RETURNS void LANGUAGE sql AS $$
  UPDATE chemicals c SET search_vector =
    setweight(to_tsvector('simple', coalesce(c.chemical_name, '') || ' ' || coalesce(c.cas_number, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(
      (SELECT string_agg(s.synonym, ' ') FROM chemical_synonyms s WHERE s.chemical_id = c.id), '')
      || ' ' || coalesce(c.chemical_formula, '') || ' ' || coalesce(c.iupac_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(
      (SELECT string_agg(concat_ws(' ', sc.brand, sc.raw_brand, l.location_name, array_to_string(sc.mentioned_locations, ' ')), ' ')
         FROM stock_containers sc LEFT JOIN storage_locations l ON l.id = sc.storage_location_id
        WHERE sc.chemical_id = c.id), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(
      (SELECT string_agg(cat.category_name, ' ') FROM chemical_categories cc JOIN categories cat ON cat.id = cc.category_id
        WHERE cc.chemical_id = c.id), '')
      || ' ' || coalesce(
      (SELECT string_agg(t.tag_name, ' ') FROM chemical_tag_mapping m JOIN chemical_tags t ON t.id = m.tag_id
        WHERE m.chemical_id = c.id), '')
      || ' ' || coalesce(c.chemical_class, '')), 'D')
  WHERE c.id = cid
$$;
`;

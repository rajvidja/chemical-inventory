# ChemStock — App Guide

ChemStock is a mobile-first chemical inventory. There is no login: open the app and start searching.
This guide lists every section of the app and the options available in each.

---

## Navigation

**Mobile (floating dark bar):** Home · Inventory · **Search** (raised lavender centre button) · Categories · More. Icons only; the active one is white with a dot, and More shows an orange dot when anything is low or out.

**Desktop (sidebar):**

| Section | Path | Purpose |
|---|---|---|
| Dashboard | `/` | Overview, search, stock health |
| Search | `/search` | Full search with filters |
| Inventory | `/inventory` | Every record, table or cards |
| Categories | `/categories` | Browse by category |
| Storage locations | `/locations` | Browse by shelf / cabinet |
| Stock alerts | `/alerts` | Low, out-of-stock and on-order items (badge excludes items already ordered) |
| Insights | `/insights` | Totals, stock health, category breakdown, usage trends |
| Data review | `/review` | Imported rows that need a human decision (badge shows count) |
| Import & export | `/import` | Upload Excel/CSV, download inventory |
| Settings | `/settings` | Stock thresholds, data, install app |

The sidebar also has a quick search box (press `/` or `⌘K` / `Ctrl+K` to focus) and an **Add chemical** button.
**More** (mobile) links to: Add chemical, Storage locations, Stock alerts, Insights, Data review, Import & export, Settings.

---

## 1. Dashboard (Home)

Home shows **what to do next**. Totals and charts live on Insights.

| # | Block | What it shows | Tap action |
|---|---|---|---|
| 1 | Search | Search bar, up to 4 recent/frequent search chips, and a stat line (records · containers · locations) | Search results / chemical |
| 2 | Categories | Bento grid of pastel tiles: one big tile for the largest category (count, name, top 3 subcategories), smaller tiles for the next ones (5 on mobile, 7 on desktop) and a black "All categories" tile | Category page / Categories |
| 3 | Needs attention | Big number (out + low + rows needing pairing) with a change chip ("+3 today"; "Collecting data" until a previous day's snapshot exists), then rows for out of stock (with critical count), running low, rows needing pairing, on order. Counts exclude chemicals already ordered. | Alerts tab / Data review |
| 4 | Action cards | **Update stock** (mint) · **Reorder** (lavender, → Stock alerts) · **Add stock** (blue) · **CAS lookup** (white); swipe sideways on mobile | See below |
| 5 | Expiring soon | Containers expired or expiring within 30 days (appears only once expiry dates exist) | Chemical detail |
| 6 | Continue where you left off | Last 5 opened chemicals with % and location | Chemical detail |
| 7 | Reorder | Low/out chemicals: critical first, then watchlist, ordered items last. Each row has **Mark as ordered**. | Order dialog / Stock alerts |
| 8 | Shelves | Most-used storage locations | Location's chemical list; "See all" → Storage locations |

Mobile header: logo, a bell (orange dot when anything is low or out) and a black **+** button (Add chemical).

**Quick actions:**
- **Update stock** — search, tap the chemical, tap the new level (0/10/25/50/75/100%). Saved immediately with an **Undo** toast; "Other value…" opens the full dialog.
- **Add stock** — search, tap the chemical, fill in the new container.
- **Reorder** — opens Stock alerts.
- **CAS lookup** — type or paste a CAS number: opens the matching record(s), or offers "Add chemical with this CAS" (pre-filled).

---

## 2. Search

- **Search bar** — matches chemical name, synonyms/abbreviations, CAS number, brand and storage location. Typo-tolerant (e.g. "benzaldehide").
- **Suggestions dropdown** — Recent searches, Frequently searched, "Try searching for", plus matching Chemicals, Brands, Locations and Categories. Picking a brand/location/category applies it as a filter.
- **Filter chips + Filters sheet:**
  - Availability (Good stock, Moderate, Low stock, Out of stock, Not recorded, Needs review)
  - Category (tree; match **Any selected** or **All selected**)
  - Storage location
  - Brand (searchable)
  - Chemical class (searchable)
  - Functional tags (searchable)
- **Active filters** row — remove one filter or clear all.
- **Sort:** Best match · Name A–Z · CAS number · Most available · Least available · Storage location · Brand · Recently updated
- **View:** Cards or Table (tablet/desktop).
- **Split view** (wide screens) — the selected chemical opens in a side panel next to results.
- All search state is in the URL, so searches can be bookmarked or shared.

---

## 3. Inventory

- Filter box: "Filter by name, CAS, brand or location"
- Same filter chips, filter sheet, sort and Cards/Table toggle as Search.
- Table columns: Chemical · CAS No. · Brand · Pack size · Availability · Location · Category (sortable).
- **Export** menu: Excel workbook (.xlsx) · CSV file (.csv)
- **Add chemical** button.

---

## 4. Chemical detail (`/chemicals/:id`)

**Header:** stock status, alert priority (Critical / Watchlist), On order badge, primary category, name, copyable CAS, formula, molecular weight.

**Header buttons:** Add stock · Availability

**More menu (⋯):**
- Edit chemical
- Change storage location
- Edit classification
- Fetch from PubChem (only with a valid CAS)
- Mark as ordered (when no order is open)
- Mark as critical · Add to watchlist · Clear alert priority
- Mark as unavailable (all containers)
- Delete record (with confirmation)

**Sections:**
1. **Availability and stock** — best container, number of containers, estimated remaining. Shows the open order (date, supplier, expected arrival) with **Received** / **Cancel**, or a **Mark as ordered** button when low/out.
2. **Container details** — one card per container (brand, pack size, % remaining, location, expiry date highlighted when within 30 days or past). Container menu:
   - Update availability
   - Change location
   - Edit container
   - Mark as unavailable
   - Delete container
3. **Storage information** — locations; locations only mentioned in an unpaired source row are shown dashed ("listed in source row").
4. **Chemical identity** — name, CAS, formula, MW, IUPAC name, identity source, synonyms & abbreviations (add/remove).
5. **Classification and tags** — categories, chemical class, functional tags, verified hazard classification (only shown when entered with a source).
6. **Additional notes**
7. **Source & history** — original spreadsheet values and change log.

**Banners when relevant:** "Containers need manual pairing" (→ Pair containers dialog), import-data notes, and other records sharing the same CAS (→ merge).

**Dialogs:**
- *Edit chemical* — name, CAS, formula, molecular weight, description, internal notes, verified hazard classification + required source.
- *Edit classification* — category tree, primary category, chemical class, functional tags.
- *Add stock / Edit container* — brand, pack size, remaining percentage, storage location, expiry date, notes. Choosing a location shows an incompatibility warning (e.g. oxidizer next to flammable, acid next to base) based **only on verified hazard classifications**; chemicals without one show "Compatibility not checked".
- *Mark as ordered* — supplier, order date, expected arrival, notes (all optional except the date).
- *Received* — closes the order and opens Add stock for the new container. *Cancel* — closes the order; the chemical shows as needing reorder again if still low.
- *Pair containers manually* — shows original spreadsheet values; build container rows (brand, pack size, quantity, %, location).

---

## 5. Add chemical (`/chemicals/new`)

- **Identity:** CAS number (checked on blur; PubChem name hint), chemical name, synonyms & abbreviations.
- **Duplicate CAS warning:** add a container to the existing record instead, or tick "allow duplicate".
- **Stock containers:** one or more rows — brand, pack size, available %, location, expiry date (optional; remove row option).
- Opening `/chemicals/new?cas=…` (from CAS lookup) pre-fills and checks the CAS.
- **Classification:** category tree.
- Sticky **Save** bar.

---

## 6. Categories

- Search categories, subcategories or tags.
- Open a category to browse it.
- **Select mode:** pick several categories, choose **Match any** or **Match all**, then browse the combination in Inventory.
- **New category** — name, parent category, description, colour, icon.

**Category detail:** subcategory chips, search within the category, and a menu with Edit category · Add subcategory (top-level only) · Delete category.

---

## 7. Storage locations

- Search ("Find a location, e.g. R1"); locations grouped by letter prefix.
- **Add location** — location code, description.

**Location detail:** container/chemical stats, local filter, chemical cards, Edit location. Shows a notice when unpaired review rows also mention this location.

---

## 8. Stock alerts

- Tabs: **All** · **Low** · **Out** · **On order**
- Sorted with critical items first, watchlist next, and already-ordered items last.
- Each alert shows the container, % left, location, priority and On order badges, and "N other in stock" when other containers exist.
- **Update** changes availability inline; **Ordered** (truck icon) marks the chemical as ordered when no other container has stock.
- **On order** tab lists open orders (order date, supplier, expected arrival) with **Received** / **Cancel**.
- Shows the current thresholds.

---

## 9. Data review

Tabs:
- **Unpaired rows** — source rows listing several brands/sizes/percentages/locations that could not be matched one-to-one. Action: *Pair containers*.
- **Warnings** — imported normally but something looked unusual (CAS check-digit failure, name not matching PubChem).
- **Errors** — rows that could not be imported (e.g. no chemical name), kept with raw values.
- **Same CAS** — separate records sharing a CAS number. Action: *Merge records* (moves containers, keeps the other name as a synonym).

Nothing from the source spreadsheet is discarded or guessed.

---

## 10. Import & export

1. **Upload** — drag and drop or choose a file (.xlsx, .xls, .csv up to 10 MB). Expected columns are listed.
2. **Preview** — summary (Rows, Ready, Warnings, For review, Errors, Already in inventory) with row tabs: All · With notes · Duplicates · Errors.
3. **Per-row decision:** Create new records · Add as containers · Skip (rows matching existing records default to Skip). Bulk actions available.
4. **Commit** — result card (New chemicals, Added to existing, Containers, Skipped, For review) with a link to Data review.
5. **Export** — Excel (.xlsx) or CSV, plus import history.

---

## 11. Insights (`/insights`)

- Totals: records, unique chemicals, containers, storage locations.
- **Low and out of stock over time** — line chart of the daily snapshots (last 30 days; hover or drag for the exact counts). Shows "Collecting data" until there are two days of snapshots.
- Stock health gauge (% good or moderate among records with a recorded level).
- Breakdown by status (links to the filtered inventory).
- Category breakdown (links to each category).
- Usage over the last 8 weeks (stock updates/moves vs. containers/chemicals added).
- Top searches in the last 30 days.

---

## 12. Settings

- **Stock thresholds** — "Good stock is above (%)" (default 50) and "Low stock is below (%)" (default 20), with a preview and reset.
- **Data** — export links (exports include expiry dates).
- **Install app** — Add to Home Screen instructions (PWA).

---

## Stock status rules

| Status | Rule (defaults) |
|---|---|
| Good stock | above 50% |
| Moderate | 20–50% |
| Low stock | below 20% and above 0 |
| Out of stock | 0% |
| Not recorded | no percentage given |
| Needs review | row awaiting manual pairing |

**Alert priority** (per chemical): *Critical* items are listed first in Needs attention, Reorder and Stock alerts; *Watchlist* items come next.

**Reorder status** (per chemical): needs reorder (low/out, no open order) → **Ordered** → **Received** (or **Cancelled**). Ordered chemicals stop counting as urgent; order history is kept in the activity log.

Thresholds can be changed in Settings.

---

## Daily snapshots

Each time Home or Insights loads, the server saves today's counts (low, out of stock, rows needing review, on order) in `count_snapshots`, one row per day (later loads that day overwrite it). Recording started with the design-system release, so the Home change chip and the Insights trend fill in over the coming days. Nothing is backfilled.

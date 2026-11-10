import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { SearchFilters, SortKey } from "@shared/types";
import type { StockStatus } from "@shared/stock";

const split = (v: string | null, sep = ",") => (v ? v.split(sep).filter(Boolean) : []);

export function countFilters(f: SearchFilters) {
  return (f.categories?.length ?? 0) + (f.brands?.length ?? 0) + (f.statuses?.length ?? 0) + (f.locations?.length ?? 0) + (f.classes?.length ?? 0) + (f.tags?.length ?? 0);
}

/** Search text, filters, sort and view mode live in the URL so results are linkable and survive back navigation. */
export function useBrowseState(defaults: { sort?: SortKey } = {}) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const filters = useMemo<SearchFilters>(
    () => ({
      categories: split(params.get("category")),
      categoryMode: params.get("categoryMode") === "all" ? "all" : "any",
      brands: split(params.get("brand")),
      statuses: split(params.get("status")) as StockStatus[],
      locations: split(params.get("location")),
      classes: split(params.get("class"), "|"),
      tags: split(params.get("tag")),
    }),
    [params],
  );
  const sort = (params.get("sort") as SortKey | null) ?? defaults.sort;
  const view = params.get("view") as "cards" | "table" | null;
  const selected = params.get("selected") ? Number(params.get("selected")) : null;

  const update = useCallback(
    (mut: (p: URLSearchParams) => void, replace = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mut(next);
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const setQ = useCallback((v: string) => update((p) => (v ? p.set("q", v) : p.delete("q"))), [update]);
  const setFilters = useCallback(
    (f: SearchFilters) =>
      update((p) => {
        const set = (k: string, v: string[] | undefined, sep = ",") => (v?.length ? p.set(k, v.join(sep)) : p.delete(k));
        set("category", f.categories);
        if (f.categoryMode === "all" && (f.categories?.length ?? 0) > 1) p.set("categoryMode", "all");
        else p.delete("categoryMode");
        set("brand", f.brands);
        set("status", f.statuses);
        set("location", f.locations);
        set("class", f.classes, "|");
        set("tag", f.tags);
      }),
    [update],
  );
  const setSort = useCallback((s: SortKey) => update((p) => p.set("sort", s)), [update]);
  const setView = useCallback((v: "cards" | "table") => update((p) => p.set("view", v)), [update]);
  const setSelected = useCallback((id: number | null) => update((p) => (id ? p.set("selected", String(id)) : p.delete("selected"))), [update]);

  return { q, filters, sort, view, selected, setQ, setFilters, setSort, setView, setSelected, filterCount: countFilters(filters) };
}

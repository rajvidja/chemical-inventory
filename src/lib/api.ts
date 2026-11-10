import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertItem,
  ChemicalDetail,
  ChemicalListItem,
  DashboardResponse,
  HazardConflict,
  InsightsResponse,
  MetaResponse,
  ReorderItem,
  SearchFilters,
  SearchResponse,
  SortKey,
  SuggestResponse,
} from "@shared/types";
import type { Thresholds } from "@shared/stock";
import type { RawRow, RowIssue } from "@shared/importParse";

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.message ?? body.error ?? `Request failed (${status})`));
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export function filtersToParams(f: SearchFilters, params = new URLSearchParams()) {
  if (f.categories?.length) params.set("category", f.categories.join(","));
  if (f.categoryMode === "all" && (f.categories?.length ?? 0) > 1) params.set("categoryMode", "all");
  if (f.brands?.length) params.set("brand", f.brands.join(","));
  if (f.statuses?.length) params.set("status", f.statuses.join(","));
  if (f.locations?.length) params.set("location", f.locations.join(","));
  if (f.classes?.length) params.set("class", f.classes.join("|"));
  if (f.tags?.length) params.set("tag", f.tags.join(","));
  return params;
}

export const qk = {
  meta: ["meta"] as const,
  dashboard: ["dashboard"] as const,
  chemical: (id: number) => ["chemical", id] as const,
  history: ["search-history"] as const,
};

export function useMeta() {
  return useQuery({ queryKey: qk.meta, queryFn: () => api<MetaResponse>("/meta"), staleTime: 60_000 });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => api<DashboardResponse>("/dashboard") });
}

export function useInsights() {
  return useQuery({ queryKey: ["insights"], queryFn: () => api<InsightsResponse>("/insights") });
}

export function useOpenOrders() {
  return useQuery({ queryKey: ["reorders"], queryFn: () => api<{ items: ReorderItem[] }>("/reorders") });
}

export function useLocationCheck(chemicalId: number, location: string) {
  const loc = location.trim();
  return useQuery({
    queryKey: ["location-check", chemicalId, loc.toLowerCase()],
    queryFn: () =>
      api<{ hasVerifiedHazard: boolean; verifiedNeighbours: number; conflicts: HazardConflict[] }>(
        `/chemicals/${chemicalId}/location-check?location=${encodeURIComponent(loc)}`,
      ),
    enabled: !!loc,
    staleTime: 30_000,
  });
}

export function useSearch(opts: { q: string; filters: SearchFilters; sort?: SortKey; pageSize?: number; enabled?: boolean }) {
  const params = filtersToParams(opts.filters);
  if (opts.q) params.set("q", opts.q);
  if (opts.sort) params.set("sort", opts.sort);
  const pageSize = opts.pageSize ?? 30;
  params.set("limit", String(pageSize));
  const key = params.toString();
  return useInfiniteQuery({
    queryKey: ["search", key],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(key);
      p.set("offset", String(pageParam));
      return api<SearchResponse>(`/search?${p}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: ["suggest", q],
    queryFn: () => api<SuggestResponse>(`/suggest?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useSearchHistory() {
  return useQuery({
    queryKey: qk.history,
    queryFn: () =>
      api<{ recent: { query: string; at: string; resultCount: number }[]; popular: { query: string; n: number }[] }>("/search-history"),
  });
}

export function useRecordSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { query: string; resultCount: number }) => api("/search-history", { method: "POST", json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.history }),
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (q?: string) => api(`/search-history${q ? `?q=${encodeURIComponent(q)}` : ""}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.history }),
  });
}

export function useChemical(id: number | null) {
  return useQuery({
    queryKey: qk.chemical(id ?? 0),
    queryFn: () => api<ChemicalDetail>(`/chemicals/${id}`),
    enabled: !!id,
  });
}

export function recordAccess(id: number, source: "search" | "browse" | "dashboard") {
  void fetch(`/api/chemicals/${id}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  }).catch(() => undefined);
}

/** Mutations that change inventory invalidate every list-type query so all screens stay consistent. */
export function useInventoryMutation<TVars, TResult = ChemicalDetail>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (data && typeof data === "object" && "id" in data && "containers" in data) {
        const detail = data as unknown as ChemicalDetail;
        qc.setQueryData(qk.chemical(detail.id), detail);
      }
      for (const key of [["search"], ["suggest"], qk.meta, qk.dashboard, ["alerts"], ["location"], ["review"], ["reorders"], ["insights"], ["location-check"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useAlerts(statuses: string[]) {
  return useQuery({
    queryKey: ["alerts", statuses.join(",")],
    queryFn: () => api<{ items: AlertItem[]; thresholds: Thresholds }>(`/alerts?status=${statuses.join(",")}`),
  });
}

export function useLocation(id: number) {
  return useQuery({
    queryKey: ["location", id],
    queryFn: () => api<{ id: number; name: string; description: string | null; items: ChemicalListItem[] }>(`/locations/${id}`),
  });
}

export interface ReviewItem {
  id: number;
  originalRow: number;
  status: string;
  raw: RawRow;
  issues: RowIssue[];
  chemicalId: number | null;
  chemicalName: string | null;
  fileName: string;
}

export function useReview(status: string) {
  return useQuery({
    queryKey: ["review", status],
    queryFn: () =>
      api<{ items: ReviewItem[]; counts: Record<string, number>; duplicates: { cas: string; ids: number[]; names: string[] }[] }>(
        `/review?status=${status}`,
      ),
  });
}

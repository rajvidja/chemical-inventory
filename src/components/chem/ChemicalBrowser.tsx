import { ArrowDownUp, LayoutGrid, Rows3, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ChemicalListItem, SearchFilters, SortKey } from "@shared/types";
import { useSearch } from "@/lib/api";
import { useIsDesktop } from "@/lib/hooks";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { EmptyState, Segmented } from "@/components/ui/primitives";
import { ChemicalCard, ChemicalCardSkeleton } from "./ChemicalCard";
import { ChemicalTable } from "./ChemicalTable";

const SORT_LABEL: Record<SortKey, string> = {
  relevance: "Best match",
  name: "Name A–Z",
  cas: "CAS number",
  availability_desc: "Most available",
  availability_asc: "Least available",
  location: "Storage location",
  brand: "Brand",
  updated: "Recently updated",
};

export function SortMenu({ sort, onSort, hasQuery }: { sort: SortKey; onSort: (s: SortKey) => void; hasQuery: boolean }) {
  const options = (Object.keys(SORT_LABEL) as SortKey[]).filter((k) => hasQuery || k !== "relevance");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <ArrowDownUp className="size-3.5" />
          <span className="max-sm:hidden">{SORT_LABEL[sort]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((k) => (
          <DropdownMenuItem key={k} onSelect={() => onSort(k)} className={cn(k === sort && "font-semibold text-teal")}>
            {SORT_LABEL[k]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChemicalBrowser({
  q,
  filters,
  sort: sortProp,
  onSort,
  view: viewProp,
  onView,
  onOpen,
  selectedId,
  locationFocus,
  empty,
  toolbar,
  forceCards,
  pageSize = 30,
  onTotal,
}: {
  onTotal?: (total: number) => void;
  q: string;
  filters: SearchFilters;
  sort?: SortKey;
  onSort: (s: SortKey) => void;
  view?: "cards" | "table" | null;
  onView?: (v: "cards" | "table") => void;
  onOpen: (c: ChemicalListItem) => void;
  selectedId?: number | null;
  locationFocus?: string;
  empty?: ReactNode;
  toolbar?: ReactNode;
  forceCards?: boolean;
  pageSize?: number;
}) {
  const desktop = useIsDesktop();
  const hasQuery = q.trim().length > 0;
  const sort: SortKey = sortProp ?? (hasQuery ? "relevance" : "name");
  const view = forceCards ? "cards" : (viewProp ?? (desktop ? "table" : "cards"));
  const res = useSearch({ q: q.trim(), filters, sort, pageSize });
  const items = useMemo(() => res.data?.pages.flatMap((p) => p.items) ?? [], [res.data]);
  const total = res.data?.pages[0]?.total ?? 0;
  const tookMs = res.data?.pages[0]?.tookMs;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!res.isLoading) onTotal?.(total);
  }, [total, res.isLoading, onTotal]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && res.hasNextPage && !res.isFetchingNextPage) void res.fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [res]);

  const initialLoading = res.isLoading;
  const stale = res.isPlaceholderData;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted" aria-live="polite">
          {initialLoading ? (
            "Searching…"
          ) : (
            <>
              <span className="font-semibold text-ink tabular">{total.toLocaleString()}</span> {total === 1 ? "chemical" : "chemicals"}
              {hasQuery && <> for “<span className="text-ink">{q.trim()}</span>”</>}
              {tookMs !== undefined && hasQuery && <span className="max-sm:hidden"> · {tookMs} ms</span>}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {toolbar}
          <SortMenu sort={sort} onSort={onSort} hasQuery={hasQuery} />
          {onView && !forceCards && (
            <Segmented
              size="sm"
              value={view}
              onChange={onView}
              className="max-md:hidden"
              options={[
                { value: "cards", label: <LayoutGrid />, title: "Card view" },
                { value: "table", label: <Rows3 />, title: "Table view" },
              ]}
            />
          )}
        </div>
      </div>

      {res.isError && (
        <EmptyState icon={<SearchX />} title="Search is unavailable" description="The inventory server could not be reached. Check your connection and try again." action={<Button variant="secondary" onClick={() => res.refetch()}>Retry</Button>} />
      )}

      {!res.isError && !initialLoading && total === 0 &&
        (empty ?? (
          <EmptyState
            icon={<SearchX />}
            title={hasQuery ? `No chemicals match “${q.trim()}”` : "No chemicals match these filters"}
            description={
              hasQuery
                ? "Try fewer characters, a common abbreviation (e.g. DMSO), the CAS number, or a storage code such as R1."
                : "Remove some filters to see more of the inventory."
            }
          />
        ))}

      <div className={cn("transition-opacity", stale && "opacity-60")}>
        {view === "table" ? (
          (initialLoading || items.length > 0) && (
            <ChemicalTable items={items} query={q} sort={sort} onSort={onSort} onOpen={onOpen} selectedId={selectedId} loading={initialLoading} />
          )
        ) : (
          <div className={cn("grid gap-3", !forceCards && "md:grid-cols-2 2xl:grid-cols-3")}>
            {initialLoading && Array.from({ length: 6 }).map((_, i) => <ChemicalCardSkeleton key={i} />)}
            {items.map((c) => (
              <ChemicalCard key={c.id} chemical={c} query={q} onOpen={() => onOpen(c)} selected={selectedId === c.id} locationFocus={locationFocus} />
            ))}
          </div>
        )}
      </div>

      <div ref={sentinel} />
      {res.isFetchingNextPage && (
        <div className={cn("mt-3 grid gap-3", view === "cards" && !forceCards && "md:grid-cols-2")}>
          <ChemicalCardSkeleton />
          <ChemicalCardSkeleton />
        </div>
      )}
      {!res.hasNextPage && items.length > pageSize && (
        <p className="mt-6 text-center text-xs text-muted">Showing all {plural(total, "chemical")}</p>
      )}
    </div>
  );
}

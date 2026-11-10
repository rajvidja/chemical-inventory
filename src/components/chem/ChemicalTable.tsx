import { ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert } from "lucide-react";
import type { ChemicalListItem, SortKey } from "@shared/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import { Cas, CategoryBadge, Highlight, LocationBadge, StatusBadge, StockBar } from "./bits";
import { ChemicalMenu } from "./ChemicalCard";

const COLUMNS: { key: string; label: string; sort?: SortKey; sortDesc?: SortKey; className?: string }[] = [
  { key: "name", label: "Chemical", sort: "name", className: "w-[26%] min-w-56" },
  { key: "cas", label: "CAS No.", sort: "cas", className: "w-28" },
  { key: "category", label: "Category", className: "w-[15%]" },
  { key: "brand", label: "Brand", sort: "brand", className: "w-[12%]" },
  { key: "pack", label: "Pack size", className: "w-24" },
  { key: "availability", label: "Availability", sort: "availability_asc", sortDesc: "availability_desc", className: "w-40" },
  { key: "location", label: "Location", sort: "location", className: "w-28" },
  { key: "actions", label: "", className: "w-10" },
];

/** One row per chemical; per-container values are stacked so each container keeps its own brand, size, % and location. */
export function ChemicalTable({
  items,
  query = "",
  sort,
  onSort,
  onOpen,
  selectedId,
  loading,
}: {
  items: ChemicalListItem[];
  query?: string;
  sort?: SortKey;
  onSort?: (s: SortKey) => void;
  onOpen: (c: ChemicalListItem) => void;
  selectedId?: number | null;
  loading?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-surface shadow-[var(--shadow-1)]">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-muted">
            <tr className="border-b border-line">
              {COLUMNS.map((col) => {
                const active = col.sort && (sort === col.sort || sort === col.sortDesc);
                const next = col.sortDesc && sort === col.sort ? col.sortDesc : col.sort;
                return (
                  <th key={col.key} className={cn("h-12 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted first:pl-5", col.className)}>
                    {col.sort && onSort ? (
                      <button onClick={() => onSort(next!)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", active && "text-ink")}>
                        {col.label}
                        {active ? (
                          sort === col.sortDesc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-3 py-3.5 first:pl-4">
                      <Skeleton className="h-3.5 w-4/5" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              items.map((chem) => {
                const primary = chem.categories.find((c) => c.isPrimary) ?? chem.categories[0];
                const rows = chem.containers.length ? chem.containers : [];
                return (
                  <tr
                    key={chem.id}
                    onClick={() => onOpen(chem)}
                    className={cn(
                      "cursor-pointer border-b border-line align-top transition-colors last:border-0 hover:bg-surface-muted/70",
                      selectedId === chem.id && "bg-lavender-soft shadow-[inset_4px_0_0_var(--color-lavender)] hover:bg-lavender-soft",
                    )}
                  >
                    <td className="px-3 py-4 pl-5">
                      <div className="font-bold leading-snug text-ink">
                        <Highlight text={chem.name} query={query} />
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={chem.status} compact />
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      {chem.match?.field === "cas" && chem.cas ? (
                        <span className="font-mono text-[12px]">
                          <Highlight text={chem.cas} query={query} />
                        </span>
                      ) : (
                        <Cas cas={chem.cas} valid={chem.casValid} />
                      )}
                    </td>
                    <td className="px-3 py-4">
                      {primary && <CategoryBadge name={primary.name} color={primary.color} icon={primary.icon} />}
                    </td>
                    {rows.some((r) => r.needsReview) ? (
                      <td colSpan={4} className="px-3 py-3">
                        <div className="rounded-[14px] bg-review-50/70 px-3 py-2 text-xs">
                          <p className="flex items-center gap-1 font-medium text-review">
                            <TriangleAlert className="size-3.5" /> Unpaired source values – needs review
                          </p>
                          <p className="mt-0.5 truncate text-muted">
                            {rows[0].raw?.brand} · {rows[0].raw?.packSize} · {rows[0].raw?.availability} · {rows[0].raw?.location}
                          </p>
                        </div>
                      </td>
                    ) : (
                      <>
                        <Stack items={rows.map((r) => r.brand ?? "—")} />
                        <Stack items={rows.map((r) => r.packSize ?? "—")} muted />
                        <td className="px-3 py-4">
                          <div className="space-y-2 pt-0.5">
                            {rows.map((r) => (
                              <StockBar key={r.id} pct={r.remainingPercentage} status={r.status} />
                            ))}
                            {!rows.length && <span className="text-muted">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="space-y-1">
                            {rows.map((r) => (r.location ? <div key={r.id}><LocationBadge name={r.location} /></div> : <div key={r.id} className="text-muted">—</div>))}
                          </div>
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <ChemicalMenu chemical={chem} onOpen={() => onOpen(chem)} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stack({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <td className="px-3 py-4">
      <div className="space-y-1">
        {items.map((v, i) => (
          <div key={i} className={cn("truncate leading-5", muted ? "text-ink-2" : "font-medium text-ink")}>
            {v}
          </div>
        ))}
        {!items.length && <span className="text-muted">—</span>}
      </div>
    </td>
  );
}

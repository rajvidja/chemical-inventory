import { Download, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBrowseState } from "@/lib/browse";
import { useDebounced, useIsDesktop } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { PageHeader } from "@/components/layout/AppShell";
import { ChemicalBrowser } from "@/components/chem/ChemicalBrowser";
import { DetailPanel, useOpenChemical, useSplitView } from "@/components/chem/DetailPanel";
import { ActiveFilters, FilterChips, FilterSheet, type FilterSection } from "@/components/search/Filters";

export function ExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <Download /> <span className="max-sm:hidden">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <a href="/api/export?format=xlsx" download>
            Excel workbook (.xlsx)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/api/export?format=csv" download>
            CSV file (.csv)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function InventoryPage() {
  const b = useBrowseState({ sort: "name" });
  const [text, setText] = useState(b.q);
  const debounced = useDebounced(text, 200);
  const [sheet, setSheet] = useState<{ open: boolean; focus?: FilterSection }>({ open: false });
  const desktop = useIsDesktop();
  const tableView = (b.view ?? (desktop ? "table" : "cards")) === "table";
  const split = useSplitView() && !tableView;
  const open = useOpenChemical({ split, setSelected: b.setSelected, source: "browse" });

  useEffect(() => {
    if (debounced.trim() !== b.q) b.setQ(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const showPanel = split && b.selected;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventory"
        subtitle="Every chemical record with its individual containers, availability and storage location."
        actions={
          <>
            <ExportMenu />
            <Button asChild>
              <Link to="/chemicals/new">
                <Plus /> <span className="max-sm:hidden">Add chemical</span>
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10 md:max-w-md">
          <Search className="size-4 text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by name, CAS, brand or location"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            aria-label="Filter inventory"
          />
          {text && (
            <button onClick={() => setText("")} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-muted" aria-label="Clear">
              <X className="size-4" />
            </button>
          )}
        </div>
        <FilterChips filters={b.filters} onOpen={(focus) => setSheet({ open: true, focus })} onClear={() => b.setFilters({})} />
        {b.filterCount > 0 && <ActiveFilters filters={b.filters} onChange={b.setFilters} />}
      </div>

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <ChemicalBrowser
            q={b.q}
            filters={b.filters}
            sort={b.sort}
            onSort={b.setSort}
            view={b.view}
            onView={b.setView}
            onOpen={open}
            selectedId={showPanel ? b.selected : null}
            forceCards={!!showPanel}
            locationFocus={b.filters.locations?.length === 1 ? b.filters.locations[0] : undefined}
          />
        </div>
        {showPanel && <DetailPanel id={b.selected!} onClose={() => b.setSelected(null)} />}
      </div>

      <FilterSheet
        key={sheet.open ? "open" : "closed"}
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        filters={b.filters}
        onApply={(f) => {
          b.setFilters(f);
          setSheet({ open: false });
        }}
        q={b.q}
        focus={sheet.focus}
      />
    </div>
  );
}

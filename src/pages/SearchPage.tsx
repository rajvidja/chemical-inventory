import { useEffect, useRef, useState } from "react";
import type { SearchFilters } from "@shared/types";
import { useRecordSearch } from "@/lib/api";
import { useBrowseState } from "@/lib/browse";
import { useDebounced } from "@/lib/hooks";
import { ChemicalBrowser } from "@/components/chem/ChemicalBrowser";
import { DetailPanel, useOpenChemical, useSplitView } from "@/components/chem/DetailPanel";
import { ActiveFilters, FilterChips, FilterSheet, type FilterSection } from "@/components/search/Filters";
import { SearchBar, type SearchBarHandle, type SuggestionPick } from "@/components/search/SearchBar";

const EMPTY: SearchFilters = {};

export default function SearchPage() {
  const b = useBrowseState();
  const [text, setText] = useState(b.q);
  const debounced = useDebounced(text, 160);
  const [sheet, setSheet] = useState<{ open: boolean; focus?: FilterSection }>({ open: false });
  const [total, setTotal] = useState(0);
  const split = useSplitView();
  const bar = useRef<SearchBarHandle>(null);
  const record = useRecordSearch();

  useEffect(() => {
    if (debounced.trim() !== b.q) b.setQ(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Keep the input in sync when the URL changes from elsewhere (e.g. back navigation or a home-page link).
  useEffect(() => {
    if (b.q !== debounced.trim()) setText(b.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.q]);

  const open = useOpenChemical({ split, setSelected: b.setSelected, q: b.q, total, source: "search" });

  const onPick = (p: SuggestionPick) => {
    switch (p.kind) {
      case "chemical":
        open({ id: p.id });
        break;
      case "query":
        setText(p.value);
        b.setQ(p.value);
        record.mutate({ query: p.value, resultCount: total });
        break;
      case "location":
        setText("");
        b.setQ("");
        b.setFilters({ ...b.filters, locations: [p.value] });
        break;
      case "brand":
        setText("");
        b.setQ("");
        b.setFilters({ ...b.filters, brands: [p.value] });
        break;
      case "category":
        setText("");
        b.setQ("");
        b.setFilters({ ...b.filters, categories: [p.value] });
        break;
    }
  };

  const showPanel = split && b.selected;
  const locationFocus = b.filters.locations?.length === 1 ? b.filters.locations[0] : undefined;

  return (
    <div className="animate-fade-in">
      <div className="sticky top-0 z-20 -mx-4 bg-surface-muted/95 px-4 pb-3 pt-1 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <h1 className="mb-3 text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px]">Search</h1>
        <SearchBar ref={bar} value={text} onChange={setText} onPick={onPick} autoFocus={!b.q && !b.filterCount} size="lg" />
        <FilterChips
          className="mt-3"
          filters={b.filters}
          onOpen={(focus) => setSheet({ open: true, focus })}
          onClear={() => b.setFilters(EMPTY)}
        />
      </div>

      <div className="mt-2 flex items-start gap-5">
        <div className="min-w-0 flex-1">
          {b.filterCount > 0 && (
            <div className="mb-3">
              <ActiveFilters filters={b.filters} onChange={b.setFilters} />
            </div>
          )}
          <ChemicalBrowser
            q={b.q}
            filters={b.filters}
            sort={b.sort}
            onSort={b.setSort}
            view={b.view ?? "cards"}
            onView={b.setView}
            onOpen={open}
            selectedId={showPanel ? b.selected : null}
            locationFocus={locationFocus}
            forceCards={!!showPanel}
            onTotal={setTotal}
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

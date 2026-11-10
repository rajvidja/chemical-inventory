import { ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryNode, SearchFilters } from "@shared/types";
import { STATUS_LABEL, type StockStatus } from "@shared/stock";
import { useMeta, useSearch } from "@/lib/api";
import { countFilters } from "@/lib/browse";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/overlays";
import { Checkbox, Input, Segmented } from "@/components/ui/primitives";
import { CategoryIcon, categoryTint, STATUS_STYLE } from "@/components/chem/bits";

export type FilterSection = "category" | "availability" | "brand" | "location" | "class" | "tag";

const SECTIONS: { key: FilterSection; label: string; field: keyof SearchFilters }[] = [
  { key: "category", label: "Category", field: "categories" },
  { key: "availability", label: "Availability", field: "statuses" },
  { key: "brand", label: "Brand", field: "brands" },
  { key: "location", label: "Storage location", field: "locations" },
  { key: "class", label: "Chemical class", field: "classes" },
  { key: "tag", label: "Functional tags", field: "tags" },
];

const STATUS_ORDER: StockStatus[] = ["good", "moderate", "low", "out", "review", "unknown"];

export function FilterChips({
  filters,
  onOpen,
  onClear,
  className,
}: {
  filters: SearchFilters;
  onOpen: (section?: FilterSection) => void;
  onClear: () => void;
  className?: string;
}) {
  const total = countFilters(filters);
  return (
    <div className={cn("-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 scrollbar-none md:-mx-0 md:px-0", className)}>
      <button
        onClick={() => onOpen()}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition",
          total ? "bg-ink text-white" : "bg-surface text-ink shadow-[var(--shadow-1)] hover:bg-sunken",
        )}
      >
        <SlidersHorizontal className="size-4" />
        Filters
        {total > 0 && <span className="grid size-5 place-items-center rounded-full bg-white/20 text-[11px] tabular">{total}</span>}
      </button>
      {SECTIONS.slice(0, 5).map((s) => {
        const n = (filters[s.field] as string[] | undefined)?.length ?? 0;
        return (
          <button
            key={s.key}
            onClick={() => onOpen(s.key)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-[13px] font-semibold transition",
              n ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line hover:text-ink",
            )}
          >
            {s.label}
            {n > 0 && <span className="tabular">· {n}</span>}
            <ChevronDown className="size-3.5 opacity-70" />
          </button>
        );
      })}
      {total > 0 && (
        <button onClick={onClear} className="inline-flex h-10 shrink-0 items-center gap-1 px-2 text-[13px] font-bold text-muted hover:text-ink">
          <X className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

/** Removable pills summarising active filters. */
export function ActiveFilters({ filters, onChange }: { filters: SearchFilters; onChange: (f: SearchFilters) => void }) {
  const { data: meta } = useMeta();
  const catName = useMemo(() => {
    const m = new Map<string, string>();
    meta?.categories.forEach((c) => {
      m.set(c.slug, c.name);
      c.children.forEach((s) => m.set(s.slug, s.name));
    });
    return m;
  }, [meta]);
  const pills: { key: string; label: string; remove: () => void }[] = [];
  const rm = (field: keyof SearchFilters, v: string) => () =>
    onChange({ ...filters, [field]: (filters[field] as string[]).filter((x) => x !== v) });
  filters.categories?.forEach((v) => pills.push({ key: `c${v}`, label: catName.get(v) ?? v, remove: rm("categories", v) }));
  filters.statuses?.forEach((v) => pills.push({ key: `s${v}`, label: STATUS_LABEL[v], remove: rm("statuses", v) }));
  filters.brands?.forEach((v) => pills.push({ key: `b${v}`, label: v, remove: rm("brands", v) }));
  filters.locations?.forEach((v) => pills.push({ key: `l${v}`, label: `📍 ${v}`, remove: rm("locations", v) }));
  filters.classes?.forEach((v) => pills.push({ key: `k${v}`, label: v, remove: rm("classes", v) }));
  filters.tags?.forEach((v) => pills.push({ key: `t${v}`, label: `#${v}`, remove: rm("tags", v) }));
  if (!pills.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(filters.categories?.length ?? 0) > 1 && (
        <span className="text-xs text-muted">Categories match {filters.categoryMode === "all" ? "all" : "any"}:</span>
      )}
      {pills.map((p) => (
        <span key={p.key} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink pl-3 pr-1.5 text-xs font-semibold text-white">
          {p.label}
          <button onClick={p.remove} className="grid size-5 place-items-center rounded-full hover:bg-white/20" aria-label={`Remove ${p.label}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  q,
  focus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: SearchFilters;
  onApply: (f: SearchFilters) => void;
  q: string;
  focus?: FilterSection;
}) {
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const { data: meta } = useMeta();
  const preview = useSearch({ q, filters: draft, pageSize: 1, enabled: open });
  const refs = useRef<Partial<Record<FilterSection, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (open) {
      setDraft(filters);
      if (focus) setTimeout(() => refs.current[focus]?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
    }
  }, [open, filters, focus]);

  const toggle = (field: keyof SearchFilters, v: string) =>
    setDraft((d) => {
      const cur = (d[field] as string[] | undefined) ?? [];
      return { ...d, [field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  const has = (field: keyof SearchFilters, v: string) => ((draft[field] as string[] | undefined) ?? []).includes(v);
  const total = preview.data?.pages[0]?.total;

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={() => setDraft({})}>
            Reset
          </Button>
          <Button
            className="flex-[2]"
            loading={preview.isFetching && total === undefined}
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            {total === undefined ? "Show results" : total === 0 ? "No matching chemicals" : `Show ${total.toLocaleString()} chemical${total === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-6 pb-2">
        <Section title="Category" sref={(el) => (refs.current.category = el)} count={draft.categories?.length}>
          {(draft.categories?.length ?? 0) > 1 && (
            <div className="mb-3 flex items-center justify-between rounded-[14px] bg-surface-muted px-3 py-2">
              <span className="text-xs text-ink-2">Chemical must be in</span>
              <Segmented
                size="sm"
                value={draft.categoryMode ?? "any"}
                onChange={(v) => setDraft((d) => ({ ...d, categoryMode: v }))}
                options={[
                  { value: "any", label: "Any selected" },
                  { value: "all", label: "All selected" },
                ]}
              />
            </div>
          )}
          <CategoryTree nodes={meta?.categories ?? []} isChecked={(s) => has("categories", s)} onToggle={(s) => toggle("categories", s)} />
        </Section>

        <Section title="Availability" sref={(el) => (refs.current.availability = el)} count={draft.statuses?.length}>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => toggle("statuses", s)}
                className={cn(
                  "flex h-12 items-center gap-2 rounded-full px-4 text-left text-[13px] font-semibold transition",
                  has("statuses", s) ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
                )}
              >
                <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
              </button>
            ))}
          </div>
          {meta && (
            <p className="mt-2 text-xs text-muted">
              Good &gt; {meta.thresholds.goodAbove}% · Moderate {meta.thresholds.lowBelow}–{meta.thresholds.goodAbove}% · Low &lt; {meta.thresholds.lowBelow}%. Based on each chemical's fullest container.
            </p>
          )}
        </Section>

        <Section title="Brand" sref={(el) => (refs.current.brand = el)} count={draft.brands?.length}>
          <CheckList items={meta?.brands ?? []} isChecked={(v) => has("brands", v)} onToggle={(v) => toggle("brands", v)} placeholder="Search brands" />
        </Section>

        <Section title="Storage location" sref={(el) => (refs.current.location = el)} count={draft.locations?.length}>
          <div className="flex flex-wrap gap-1.5">
            {meta?.locations.map((l) => (
              <button
                key={l.id}
                onClick={() => toggle("locations", l.name)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 font-mono text-xs font-bold transition",
                  has("locations", l.name) ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
                )}
              >
                {l.name}
                <span className={cn("font-sans tabular", has("locations", l.name) ? "text-white/70" : "text-muted")}>{l.chemicalCount}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Chemical class" sref={(el) => (refs.current.class = el)} count={draft.classes?.length}>
          <CheckList items={meta?.classes ?? []} isChecked={(v) => has("classes", v)} onToggle={(v) => toggle("classes", v)} placeholder="Search classes, e.g. aldehyde" />
        </Section>

        <Section title="Functional tags" sref={(el) => (refs.current.tag = el)} count={draft.tags?.length}>
          <CheckList items={meta?.tags ?? []} isChecked={(v) => has("tags", v)} onToggle={(v) => toggle("tags", v)} placeholder="Search tags, e.g. fluorinated" />
        </Section>
      </div>
    </SidePanel>
  );
}

function Section({ title, children, sref, count }: { title: string; children: React.ReactNode; sref: (el: HTMLDivElement | null) => void; count?: number }) {
  return (
    <div ref={sref} className="scroll-mt-2">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
        {title}
        {count ? <span className="rounded-full bg-ink px-2 text-[11px] text-white">{count}</span> : null}
      </h3>
      {children}
    </div>
  );
}

export function CategoryTree({
  nodes,
  isChecked,
  onToggle,
}: {
  nodes: CategoryNode[];
  isChecked: (slug: string) => boolean;
  onToggle: (slug: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="divide-y divide-line rounded-[14px] border border-line">
      {nodes.map((n) => {
        const childSel = n.children.filter((c) => isChecked(c.slug)).length;
        const expanded = open[n.slug] ?? childSel > 0;
        return (
          <div key={n.slug}>
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <Checkbox
                checked={isChecked(n.slug) ? true : childSel ? "indeterminate" : false}
                onCheckedChange={() => onToggle(n.slug)}
                aria-label={n.name}
              />
              <span className="grid size-7 shrink-0 place-items-center rounded-full text-ink-2" style={{ background: categoryTint(n.name, n.color).soft }}>
                <CategoryIcon icon={n.icon} className="size-3.5" />
              </span>
              <button type="button" className="flex-1 truncate text-left text-sm text-ink" onClick={() => onToggle(n.slug)}>
                {n.name}
              </button>
              <span className="text-xs text-muted tabular">{n.chemicalCount}</span>
              {n.children.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [n.slug]: !expanded }))}
                  className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-muted"
                  aria-label={expanded ? `Collapse ${n.name}` : `Expand ${n.name}`}
                >
                  <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                </button>
              )}
            </div>
            {expanded && n.children.length > 0 && (
              <div className="space-y-0.5 pb-2 pl-[3.25rem] pr-3 animate-fade-in">
                {n.children.map((c) => (
                  <label key={c.slug} className="flex cursor-pointer items-center gap-2.5 py-1.5">
                    <Checkbox checked={isChecked(c.slug)} onCheckedChange={() => onToggle(c.slug)} />
                    <span className="flex-1 text-[13px] text-ink-2">{c.name}</span>
                    <span className="text-xs text-muted tabular">{c.chemicalCount}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckList({
  items,
  isChecked,
  onToggle,
  placeholder,
}: {
  items: { value: string; count: number }[];
  isChecked: (v: string) => boolean;
  onToggle: (v: string) => void;
  placeholder: string;
}) {
  const [term, setTerm] = useState("");
  const [all, setAll] = useState(false);
  const filtered = items.filter((i) => i.value.toLowerCase().includes(term.toLowerCase()));
  const shown = all || term ? filtered : filtered.slice(0, 8);
  const selectedHidden = items.filter((i) => isChecked(i.value) && !shown.includes(i));
  return (
    <div>
      {items.length > 8 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} className="h-9 pl-9" />
        </div>
      )}
      <div className="space-y-0.5">
        {[...selectedHidden, ...shown].map((i) => (
          <label key={i.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-surface-muted">
            <Checkbox checked={isChecked(i.value)} onCheckedChange={() => onToggle(i.value)} />
            <span className="flex-1 truncate text-[13px] text-ink">{i.value}</span>
            <span className="text-xs text-muted tabular">{i.count}</span>
          </label>
        ))}
        {!filtered.length && <p className="px-1 py-2 text-xs text-muted">No matches</p>}
      </div>
      {!term && filtered.length > 8 && (
        <button onClick={() => setAll(!all)} className="mt-1 px-1 text-xs font-medium text-teal hover:underline">
          {all ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

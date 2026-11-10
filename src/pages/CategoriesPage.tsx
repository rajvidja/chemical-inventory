import { ArrowRight, Check, FolderPlus, ListChecks, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CategoryNode } from "@shared/types";
import { normalizeText } from "@shared/normalize";
import { useMeta } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";
import { CategoryIcon, categoryTint } from "@/components/chem/bits";
import { CategoryDialog } from "@/components/chem/CategoryDialog";

function matches(n: CategoryNode, term: string) {
  if (!term) return true;
  const hay = normalizeText([n.name, n.description ?? "", ...n.children.map((c) => c.name), ...n.topTags].join(" "));
  return term.split(" ").every((t) => hay.includes(t));
}

export default function CategoriesPage() {
  const { data: meta, isLoading } = useMeta();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"any" | "all">("any");
  const [creating, setCreating] = useState(false);
  const t = normalizeText(term);
  const nodes = useMemo(() => (meta?.categories ?? []).filter((n) => matches(n, t)), [meta, t]);

  const toggle = (slug: string) => setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  const browse = () => navigate(`/inventory?category=${selected.join(",")}${mode === "all" && selected.length > 1 ? "&categoryMode=all" : ""}`);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Categories"
        subtitle="Chemicals can belong to several categories. Open one to browse it, or select several to combine them."
        actions={
          <>
            <Button variant={selecting ? "primary" : "secondary"} onClick={() => { setSelecting(!selecting); setSelected([]); }}>
              {selecting ? <X /> : <ListChecks />} <span className="max-sm:hidden">{selecting ? "Cancel" : "Select"}</span>
            </Button>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <FolderPlus /> <span className="max-sm:hidden">New category</span>
            </Button>
          </>
        }
      />

      <div className="mb-5 flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10 md:max-w-md">
        <Search className="size-4 text-muted" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search categories, subcategories or tags" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted" aria-label="Search categories" />
        {term && (
          <button onClick={() => setTerm("")} className="text-muted hover:text-ink" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[20px]" />)}
        {nodes.map((n) => {
          const on = selected.includes(n.slug);
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-14 place-items-center rounded-full text-ink-2" style={{ background: categoryTint(n.name, n.color).soft }}>
                  <CategoryIcon icon={n.icon} className="size-5" />
                </span>
                {selecting ? (
                  <span className={cn("grid size-6 place-items-center rounded-full border-2 transition", on ? "border-teal bg-teal text-white" : "border-line-strong")}>
                    {on && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                ) : (
                  <span className="text-right">
                    <span className="block text-xl font-semibold leading-none text-ink tabular">{n.chemicalCount}</span>
                    <span className="text-[11px] text-muted">chemicals</span>
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-[15px] font-semibold text-ink">{n.name}</h2>
              {n.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{n.description}</p>}
              {n.children.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {n.children
                    .filter((c) => c.chemicalCount > 0)
                    .slice(0, 4)
                    .map((c) => (
                      <span key={c.slug} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11.5px] text-ink-2">
                        {c.name} <span className="text-muted">{c.chemicalCount}</span>
                      </span>
                    ))}
                  {n.children.length > 4 && <span className="px-1 py-0.5 text-[11.5px] text-muted">+{n.children.length - 4} more</span>}
                </div>
              )}
            </>
          );
          return selecting ? (
            <button key={n.slug} onClick={() => toggle(n.slug)} className={cn("rounded-[var(--radius-card)] border bg-surface p-4 text-left transition", on ? "border-teal ring-2 ring-teal/15" : "border-line hover:border-line-strong")}>
              {body}
            </button>
          ) : (
            <Link key={n.slug} to={`/categories/${n.slug}`} className="rounded-[28px] bg-surface shadow-[var(--shadow-1)] p-4 transition hover:border-line-strong hover:shadow-[var(--shadow-soft)]">
              {body}
            </Link>
          );
        })}
      </div>
      {!isLoading && !nodes.length && <EmptyState icon={<Search />} title="No categories match" description="Try a different word, or create a new category." />}

      {selecting && (
        <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-lg animate-slide-up md:bottom-6">
          <Card className="flex flex-wrap items-center gap-3 p-3 shadow-[var(--shadow-float)]">
            <p className="flex-1 text-sm text-ink">
              <b>{selected.length}</b> selected
            </p>
            {selected.length > 1 && (
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "any", label: "Match any", title: "Chemicals in at least one selected category" },
                  { value: "all", label: "Match all", title: "Chemicals in every selected category" },
                ]}
              />
            )}
            <Button disabled={!selected.length} onClick={browse}>
              Browse <ArrowRight />
            </Button>
          </Card>
        </div>
      )}

      {creating && <CategoryDialog open onOpenChange={setCreating} />}
    </div>
  );
}

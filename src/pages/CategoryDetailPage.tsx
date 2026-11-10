import { FolderPlus, MoreHorizontal, Pencil, Search, SearchX, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { CategoryNode, SortKey } from "@shared/types";
import { api, recordAccess, useInventoryMutation, useMeta } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, useConfirm } from "@/components/ui/overlays";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { CategoryIcon, categoryTint } from "@/components/chem/bits";
import { ChemicalBrowser } from "@/components/chem/ChemicalBrowser";
import { CategoryDialog } from "@/components/chem/CategoryDialog";
import { BackButton } from "./ChemicalPage";

export default function CategoryDetailPage() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const sub = params.get("sub");
  const { data: meta, isLoading } = useMeta();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const q = useDebounced(text, 180);
  const [dialog, setDialog] = useState<null | { category?: CategoryNode; parentId?: number }>(null);

  const { node, parent } = useMemo(() => {
    for (const c of meta?.categories ?? []) {
      if (c.slug === slug) return { node: c, parent: null };
      const child = c.children.find((s) => s.slug === slug);
      if (child) return { node: child, parent: c };
    }
    return { node: null, parent: null };
  }, [meta, slug]);

  useEffect(() => {
    setText("");
  }, [slug]);

  const remove = useInventoryMutation((id: number) => api(`/categories/${id}`, { method: "DELETE" }));

  if (isLoading) return <Skeleton className="h-40 rounded-[20px]" />;
  if (!node)
    return <EmptyState icon={<SearchX />} title="Category not found" action={<Button onClick={() => navigate("/categories")}>All categories</Button>} />;

  const active = sub && node.children.some((c) => c.slug === sub) ? sub : node.slug;
  const sort = (params.get("sort") as SortKey | null) ?? undefined;
  const view = params.get("view") as "cards" | "table" | null;
  const setParam = (k: string, v: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v) n.set(k, v);
      else n.delete(k);
      return n;
    }, { replace: true });

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${node.name}”?`,
      description: (
        <>
          {node.chemicalCount} chemical(s) are linked to it. They keep their other categories; chemicals left without any category move to <b>Unclassified</b>.
          {node.children.length > 0 && " Its subcategories are deleted too."} No inventory records are deleted.
        </>
      ),
      confirmLabel: "Delete category",
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(node.id, {
      onSuccess: () => {
        toast.success("Category deleted");
        navigate(parent ? `/categories/${parent.slug}` : "/categories");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="animate-fade-in">
      <BackButton label={parent ? parent.name : "Categories"} fallback={parent ? `/categories/${parent.slug}` : "/categories"} />
      <div className="mb-5 flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full text-ink-2" style={{ background: categoryTint(node.name, node.color).soft }}>
          <CategoryIcon icon={node.icon} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px]">{node.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {node.chemicalCount} chemicals{node.description ? ` · ${node.description}` : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="Category actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setDialog({ category: node })}>
              <Pencil /> Edit category
            </DropdownMenuItem>
            {!parent && (
              <DropdownMenuItem onSelect={() => setDialog({ parentId: node.id })}>
                <FolderPlus /> Add subcategory
              </DropdownMenuItem>
            )}
            {node.slug !== "unclassified" && (
              <DropdownMenuItem destructive onSelect={onDelete}>
                <Trash2 /> Delete category
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {node.children.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:flex-wrap md:px-0">
          <button
            onClick={() => setParam("sub", null)}
            className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition", active === node.slug ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-2 hover:text-ink")}
          >
            All <span className="opacity-70">{node.chemicalCount}</span>
          </button>
          {node.children.map((c) => (
            <button
              key={c.slug}
              onClick={() => setParam("sub", c.slug)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition",
                active === c.slug ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-2 hover:text-ink",
                c.chemicalCount === 0 && active !== c.slug && "opacity-60",
              )}
            >
              {c.name} <span className="opacity-70">{c.chemicalCount}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10 md:max-w-md">
        <Search className="size-4 text-muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search within ${node.name}`} className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        {text && (
          <button onClick={() => setText("")} className="text-muted hover:text-ink" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>

      <ChemicalBrowser
        q={q}
        filters={{ categories: [active] }}
        sort={sort}
        onSort={(s) => setParam("sort", s)}
        view={view}
        onView={(v) => setParam("view", v)}
        onOpen={(c) => {
          recordAccess(c.id, "browse");
          navigate(`/chemicals/${c.id}`);
        }}
      />

      {dialog && <CategoryDialog open onOpenChange={(o) => !o && setDialog(null)} category={dialog.category} parentId={dialog.parentId} />}
    </div>
  );
}

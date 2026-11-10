import { ArrowRight, CheckCircle2, GitMerge } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, useInventoryMutation, useReview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/overlays";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";

type Tab = "needs_review" | "imported_with_warnings" | "error" | "duplicates";

const INTRO: Record<Tab, string> = {
  needs_review:
    "These rows list several brands, sizes, percentages or locations that could not be matched one-to-one. The original values are preserved; open each record to pair its containers.",
  imported_with_warnings: "Imported normally, but something looked unusual (e.g. a CAS check-digit failure or a name that does not match PubChem for that CAS).",
  error: "Rows that could not be imported (for example, no chemical name). They are logged with their raw values.",
  duplicates:
    "Separate records that share a CAS number. Some are genuinely different products (e.g. silica gel grades); merge only true duplicates. Merging moves all containers and keeps the other name as a synonym.",
};

export default function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "needs_review";
  const { data, isLoading } = useReview(tab === "duplicates" ? "needs_review" : tab);
  const confirm = useConfirm();
  const merge = useInventoryMutation(async (v: { target: number; sources: number[] }) => {
    for (const s of v.sources) await api(`/chemicals/${v.target}/merge`, { method: "POST", json: { sourceId: s } });
    return null;
  });

  const counts = data?.counts ?? {};
  const onMerge = async (g: { cas: string; ids: number[]; names: string[] }) => {
    const ok = await confirm({
      title: `Merge ${g.ids.length} records for CAS ${g.cas}?`,
      description: (
        <>
          All containers will be combined under <b>{g.names[0]}</b>. Other names ({g.names.slice(1).join(", ")}) become searchable synonyms. Only do this if they are the same product.
        </>
      ),
      confirmLabel: "Merge records",
    });
    if (!ok) return;
    merge.mutate({ target: g.ids[0], sources: g.ids.slice(1) }, { onSuccess: () => toast.success("Records merged"), onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Data review" subtitle="Nothing from the source spreadsheet was discarded or guessed. These items need a human decision." />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
        <Segmented
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[
            { value: "needs_review", label: `Unpaired rows${counts.needs_review !== undefined ? ` · ${counts.needs_review}` : ""}` },
            { value: "imported_with_warnings", label: `Warnings${counts.imported_with_warnings !== undefined ? ` · ${counts.imported_with_warnings}` : ""}` },
            { value: "error", label: `Errors${counts.error !== undefined ? ` · ${counts.error}` : ""}` },
            { value: "duplicates", label: `Same CAS${data ? ` · ${data.duplicates.length}` : ""}` },
          ]}
        />
      </div>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-2">{INTRO[tab]}</p>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
      )}

      {tab !== "duplicates" && data && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.items.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {r.fileName} · row {r.originalRow}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-ink">{r.chemicalName ?? r.raw.name ?? "Unnamed row"}</p>
                </div>
                {r.chemicalId && (
                  <Button size="sm" variant={tab === "needs_review" ? "primary" : "secondary"} asChild>
                    <Link to={`/chemicals/${r.chemicalId}`}>
                      {tab === "needs_review" ? "Pair containers" : "Open"} <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-[90px_1fr] gap-x-2 gap-y-0.5 text-xs">
                {(["cas", "brand", "quantity", "available", "location"] as const).map((k) => (
                  <div key={k} className="contents">
                    <dt className="capitalize text-muted">{k === "cas" ? "CAS No." : k}</dt>
                    <dd className="truncate font-mono text-ink-2">{r.raw[k] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-2.5 space-y-0.5 text-xs">
                {r.issues
                  .filter((i) => i.code !== "manually_resolved")
                  .map((i, k) => (
                    <li key={k} className={cn(i.level === "error" ? "text-danger" : i.level === "review" ? "text-review" : "text-warning-700")}>
                      • {i.message}
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tab === "duplicates" && data && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.duplicates.map((g) => (
            <Card key={g.cas} className="p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-sm font-semibold text-ink">CAS {g.cas}</p>
                <Button size="sm" variant="secondary" onClick={() => onMerge(g)} loading={merge.isPending}>
                  <GitMerge /> Merge
                </Button>
              </div>
              <ul className="space-y-1">
                {g.ids.map((id, i) => (
                  <li key={id}>
                    <Link to={`/chemicals/${id}`} className="text-sm text-ink-2 hover:text-teal hover:underline">
                      {g.names[i]}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {data && (tab === "duplicates" ? !data.duplicates.length : !data.items.length) && (
        <EmptyState icon={<CheckCircle2 />} title="All clear" description="Nothing left to review in this list." />
      )}
    </div>
  );
}

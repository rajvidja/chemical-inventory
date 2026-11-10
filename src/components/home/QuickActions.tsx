import { ArrowUpRight, ChevronRight, Hash, PackagePlus, Percent, Plus, Search, Truck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ChemicalListItem } from "@shared/types";
import { api, recordAccess, useInventoryMutation, useSearch } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn, formatPct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Skeleton } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Cas, LocationBadge, STATUS_STYLE, StatusBadge } from "@/components/chem/bits";
import { useChemActions } from "@/components/chem/ChemActions";

type Sheet = "update" | "add" | "cas" | null;

const QUICK_PCTS = [0, 10, 25, 50, 75, 100];

function ActionCard({
  icon,
  tag,
  title,
  hint,
  tone,
  iconTone = "bg-surface",
  onClick,
  to,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  hint: string;
  tone: string;
  iconTone?: string;
  onClick?: () => void;
  to?: string;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className={cn("grid size-14 place-items-center rounded-full text-ink [&_svg]:size-6", iconTone)}>{icon}</span>
        <span className="rounded-full bg-ink/[0.07] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">{tag}</span>
      </span>
      <span className="mt-auto flex items-end justify-between gap-2 pt-6">
        <span className="min-w-0">
          <span className="block text-[22px] font-bold leading-tight tracking-[-0.01em]">{title}</span>
          <span className="mt-1 block text-[13px] font-medium opacity-75">{hint}</span>
        </span>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white">
          <ArrowUpRight className="size-5" />
        </span>
      </span>
    </>
  );
  const cls = cn(
    "flex min-h-[188px] w-[236px] shrink-0 snap-start flex-col rounded-[28px] p-5 text-left transition active:scale-[0.98] md:w-auto",
    tone,
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function QuickActions({ reorderCount }: { reorderCount?: number }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  return (
    <>
      <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 2xl:grid-cols-4">
        <ActionCard icon={<Percent />} tag="2 taps" title="Update stock" hint="Log what you just used" tone="bg-mint text-mint-text hover:brightness-[0.98]" onClick={() => setSheet("update")} />
        <ActionCard
          icon={<Truck />}
          tag={reorderCount === undefined ? "Reorder" : `${reorderCount} to order`}
          title="Reorder"
          hint="Low and empty chemicals"
          tone="bg-lavender text-lavender-text hover:brightness-[0.98]"
          to="/alerts"
        />
        <ActionCard icon={<PackagePlus />} tag="Stock" title="Add stock" hint="New bottle of a known chemical" tone="bg-sky-soft text-sky-text hover:brightness-[0.98]" onClick={() => setSheet("add")} />
        <ActionCard icon={<Hash />} tag="CAS" title="CAS lookup" hint="Find or add by CAS number" tone="bg-surface text-ink shadow-[var(--shadow-1)]" iconTone="bg-sunken" onClick={() => setSheet("cas")} />
      </div>
      {(sheet === "update" || sheet === "add") && <PickChemicalSheet key={sheet} mode={sheet} onClose={() => setSheet(null)} />}
      {sheet === "cas" && <CasLookupSheet onClose={() => setSheet(null)} />}
    </>
  );
}

function PickChemicalSheet({ mode, onClose }: { mode: "update" | "add"; onClose: () => void }) {
  const actions = useChemActions();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 160);
  const res = useSearch({ q: dq, filters: {}, pageSize: 8, enabled: !!dq });
  const items = res.data?.pages[0]?.items ?? [];
  const [picked, setPicked] = useState<ChemicalListItem | null>(null);
  const patch = useInventoryMutation((v: { id: number; pct: number | null }) =>
    api(`/containers/${v.id}`, { method: "PATCH", json: { remainingPercentage: v.pct } }),
  );

  const pick = (c: ChemicalListItem) => {
    recordAccess(c.id, "search");
    if (mode === "add") {
      onClose();
      actions.addContainer(c);
    } else setPicked(c);
  };

  const setPct = (chem: ChemicalListItem, containerId: number, prev: number | null, pct: number) =>
    patch.mutate(
      { id: containerId, pct },
      {
        onSuccess: () => {
          onClose();
          toast.success(`${chem.name} set to ${pct}%`, {
            action: { label: "Undo", onClick: () => patch.mutate({ id: containerId, pct: prev }) },
          });
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const editable = picked?.containers.filter((c) => !c.needsReview) ?? [];

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={picked ? picked.name : mode === "update" ? "Update stock" : "Add stock"}
      description={picked ? "Tap the new level to save it." : mode === "update" ? "Find the chemical you just used." : "Find the chemical you are adding a container to."}
    >
      {picked ? (
        <div className="space-y-3">
          {editable.length ? (
            editable.map((c) => (
              <div key={c.id} className="rounded-[20px] bg-surface-muted p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-ink">{c.brand ?? "Unknown brand"}</span>
                    <span className="text-muted"> · {c.packSize ?? "—"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.location && <LocationBadge name={c.location} />}
                    <span className={cn("text-sm font-semibold tabular", STATUS_STYLE[c.status].text)}>{formatPct(c.remainingPercentage)}</span>
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {QUICK_PCTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={patch.isPending}
                      onClick={() => setPct(picked, c.id, c.remainingPercentage, v)}
                      className={cn(
                        "h-11 rounded-full text-[13px] font-bold tabular transition active:scale-95",
                        c.remainingPercentage === v ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-[var(--shadow-1)] hover:bg-sunken",
                      )}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2.5 text-xs font-bold text-blue hover:underline"
                  onClick={() => {
                    onClose();
                    actions.updateAvailability(picked, c.id);
                  }}
                >
                  Other value…
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-[20px] bg-review-50 p-4 text-sm font-medium text-review">
              This chemical has no individually recorded containers yet. Open it to pair its source row first.
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
            ← Pick another chemical
          </Button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, CAS or synonym" className="h-12 rounded-full pl-10" />
          </div>
          <div className="mt-3 min-h-40">
            {res.isFetching && !items.length && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-[20px]" />
                ))}
              </div>
            )}
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center gap-3 rounded-[20px] px-2 py-2.5 text-left transition hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{c.name}</span>
                  <Cas cas={c.cas} valid={c.casValid} />
                </span>
                <StatusBadge status={c.status} compact />
                <ChevronRight className="size-4 text-muted" />
              </button>
            ))}
            {dq && res.data && !items.length && <p className="py-6 text-center text-sm text-muted">No chemicals match “{dq}”.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

interface CasCheck {
  cas: string;
  valid: boolean;
  reason: string | null;
  existing: { id: number; name: string; containerCount: number }[];
  pubchem: { title: string | null } | null;
}

function CasLookupSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [cas, setCas] = useState("");
  const [result, setResult] = useState<CasCheck | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cas.trim()) return;
    setLoading(true);
    try {
      setResult(await api<CasCheck>(`/chemicals/check-cas?cas=${encodeURIComponent(cas.trim())}`));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const open = (id: number) => {
    recordAccess(id, "search");
    onClose();
    navigate(`/chemicals/${id}`);
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="CAS lookup" description="Type or paste a CAS registry number, e.g. 67-68-5.">
      <form onSubmit={lookup} className="flex gap-2">
        <Input
          autoFocus
          value={cas}
          onChange={(e) => {
            setCas(e.target.value);
            setResult(null);
          }}
          placeholder="CAS number"
          inputMode="numeric"
          className="h-12 flex-1 rounded-full font-mono"
        />
        <Button type="submit" loading={loading} className="h-12 rounded-full px-5">
          Find
        </Button>
      </form>
      {result && (
        <div className="mt-4 space-y-2">
          {!result.valid && (
            <p className="rounded-[14px] bg-warning-50 p-3 text-[13px] font-medium text-warning-700">
              {result.reason === "checksum" ? "The check digit does not validate." : "This does not look like a CAS number."} Double-check the label.
            </p>
          )}
          {result.existing.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => open(m.id)}
              className="flex w-full items-center gap-3 rounded-[20px] bg-surface-muted px-4 py-3 text-left transition hover:bg-sunken"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{m.name}</span>
                <span className="text-xs text-muted">
                  {m.containerCount} container{m.containerCount === 1 ? "" : "s"}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted" />
            </button>
          ))}
          {result.valid && !result.existing.length && (
            <div className="rounded-[20px] bg-cream-soft p-5 text-center">
              <p className="text-sm font-medium text-ink">CAS {result.cas} is not in the inventory</p>
              {result.pubchem?.title && <p className="mt-0.5 text-xs text-muted">PubChem: {result.pubchem.title}</p>}
              <Button
                className="mt-3"
                onClick={() => {
                  onClose();
                  navigate(`/chemicals/new?cas=${encodeURIComponent(result.cas)}`);
                }}
              >
                <Plus /> Add chemical with this CAS
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

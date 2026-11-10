import {
  ArrowRightLeft,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  History,
  Info,
  MapPin,
  MapPinned,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Percent,
  Plus,
  ShieldAlert,
  Tags,
  Trash2,
  TriangleAlert,
  X,
  Ban,
  CalendarClock,
  Eye,
  Flame,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ChemicalDetail, ContainerSummary } from "@shared/types";
import { formatQuantity, STATUS_LABEL } from "@shared/stock";
import { api, useInventoryMutation } from "@/lib/api";
import { cn, daysUntil, expiryText, formatDate, formatPct, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, useConfirm } from "@/components/ui/overlays";
import { Card, Input, Skeleton } from "@/components/ui/primitives";
import { CategoryBadge, LocationBadge, OrderedBadge, PriorityBadge, ProgressRing, STATUS_STYLE, StatusBadge } from "./bits";
import { useChemActions } from "./ChemActions";
import { ClassificationDialog, EditChemicalDialog, ResolveDialog } from "./ChemicalDialogs";

const SOURCE_EXPLAIN: Record<string, string> = {
  curated: "Assigned from a reviewed reagent-role table keyed by CAS number.",
  structure: "Derived from functional groups in the PubChem structure for this CAS number.",
  manual: "Set manually by a user.",
  unclassified: "No verified structure or curated role – awaiting manual classification.",
};

const ACTION_LABEL: Record<string, string> = {
  availability_updated: "Availability updated",
  marked_unavailable: "Marked unavailable",
  location_changed: "Location changed",
  container_updated: "Container edited",
  container_added: "Container added",
  container_deleted: "Container deleted",
  chemical_updated: "Details edited",
  chemical_created: "Chemical added",
  classification_updated: "Classification updated",
  review_resolved: "Review resolved",
  records_merged: "Records merged",
  pubchem_enriched: "PubChem data added",
  priority_changed: "Alert priority changed",
  reorder_placed: "Marked as ordered",
  reorder_received: "Order received",
  reorder_cancelled: "Order cancelled",
  reorder_updated: "Order updated",
};

function Section({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold tracking-[-0.01em] text-ink">
          <span className="grid size-10 place-items-center rounded-full bg-sunken text-ink [&_svg]:size-[18px]">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm md:grid-cols-[150px_1fr]">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className={cn("min-w-0 break-words font-semibold text-ink", mono && "font-mono text-[13px] font-medium")}>{children}</dd>
    </div>
  );
}

export function ChemicalDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-40 w-full rounded-[20px]" />
      <Skeleton className="h-56 w-full rounded-[20px]" />
    </div>
  );
}

function ExpiryLine({ date }: { date: string }) {
  const days = daysUntil(date);
  return (
    <p
      className={cn(
        "mt-3 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
        days < 0 ? "bg-expired-soft text-expired-text" : days <= 30 ? "bg-expiring-soft text-expiring-text" : "bg-sunken text-muted",
      )}
    >
      <CalendarClock className="size-3.5" />
      {days <= 30 ? `${expiryText(days)} · ${formatDate(date)}` : `Expires ${formatDate(date)}`}
    </p>
  );
}

function ContainerCard({ c, chemical }: { c: ContainerSummary; chemical: ChemicalDetail }) {
  const actions = useChemActions();
  const remaining = formatQuantity(c.remainingQuantity, c.packUnit);
  return (
    <div className="rounded-[20px] bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => actions.updateAvailability(chemical, c.id)} aria-label="Update availability" className="rounded-full transition active:scale-95">
          <ProgressRing pct={c.remainingPercentage} status={c.status} />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-[15px] font-bold text-ink">{c.brand ?? "Unknown brand"}</p>
          <p className="text-xs font-medium text-muted">
            {c.packSize ?? "Pack size not recorded"}
            {remaining && <> · ≈ {remaining} left</>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {c.location ? (
              <Link to={`/locations?focus=${encodeURIComponent(c.location)}`} onClick={(e) => e.stopPropagation()}>
                <LocationBadge name={c.location} className="bg-surface" />
              </Link>
            ) : (
              <span className="text-xs text-muted">No location</span>
            )}
            <StatusBadge status={c.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 text-muted" aria-label="Container actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => actions.updateAvailability(chemical, c.id)}>
                <Percent /> Update availability
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.changeLocation(chemical, c.id)}>
                <MapPinned /> Change location
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.editContainer(chemical, c.id)}>
                <Pencil /> Edit container
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={c.remainingPercentage === 0} onSelect={() => actions.markUnavailable(chemical, c)}>
                <Ban /> Mark as unavailable
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => actions.deleteContainer(chemical, c)}>
                <Trash2 /> Delete container
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {c.expiryDate && <ExpiryLine date={c.expiryDate} />}
      {(c.notes || c.sourceExcelRow) && (
        <p className="mt-2.5 text-xs text-muted">
          {c.notes}
          {c.notes && c.sourceExcelRow ? " · " : ""}
          {c.sourceExcelRow ? `Excel row ${c.sourceExcelRow}` : ""} · updated {timeAgo(c.updatedAt)}
        </p>
      )}
    </div>
  );
}

export function ChemicalDetailView({ chemical, compact, onClose }: { chemical: ChemicalDetail; compact?: boolean; onClose?: () => void }) {
  const actions = useChemActions();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [resolving, setResolving] = useState<ChemicalDetail["importRecords"][number] | null>(null);
  const [newSyn, setNewSyn] = useState("");

  const del = useInventoryMutation(() => api(`/chemicals/${chemical.id}`, { method: "DELETE" }));
  const addSyn = useInventoryMutation((synonym: string) => api(`/chemicals/${chemical.id}/synonyms`, { method: "POST", json: { synonym } }));
  const rmSyn = useInventoryMutation((id: number) => api(`/synonyms/${id}`, { method: "DELETE" }).then(() => api<ChemicalDetail>(`/chemicals/${chemical.id}`)));
  const merge = useInventoryMutation((sourceId: number) => api(`/chemicals/${chemical.id}/merge`, { method: "POST", json: { sourceId } }));
  const pubchem = useInventoryMutation(() => api(`/chemicals/${chemical.id}/pubchem`, { method: "POST" }));
  const markAll = useInventoryMutation(async (ids: number[]) => {
    for (const id of ids) await api(`/containers/${id}`, { method: "PATCH", json: { remainingPercentage: 0 } });
    return api<ChemicalDetail>(`/chemicals/${chemical.id}`);
  });

  const containers = chemical.containers.filter((c) => !c.needsReview);
  const reviewRecords = chemical.importRecords.filter((r) => r.status === "needs_review");
  const allIssues = chemical.importRecords.flatMap((r) => r.issues.filter((i) => i.level !== "review" && i.code !== "manually_resolved"));
  const primary = chemical.categories.find((c) => c.isPrimary) ?? chemical.categories[0];

  const totals = new Map<string, number>();
  for (const c of containers) if (c.remainingQuantity !== null && c.packUnit) totals.set(c.packUnit, (totals.get(c.packUnit) ?? 0) + c.remainingQuantity);
  const locations = new Map<string, number>();
  for (const c of containers) if (c.location) locations.set(c.location, (locations.get(c.location) ?? 0) + 1);
  const unpairedLocations = [
    ...new Set(chemical.containers.filter((c) => c.needsReview).flatMap((c) => c.mentionedLocations)),
  ].filter((n) => !locations.has(n));
  const available = containers.filter((c) => (c.remainingPercentage ?? 0) > 0).length;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${chemical.name}?`,
      description: (
        <>
          This permanently removes the chemical and its {chemical.containerCount} container record(s). The original spreadsheet row
          stays in the import log marked as deleted, so the deletion remains traceable.
        </>
      ),
      confirmLabel: "Delete chemical",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${chemical.name} deleted`);
        if (onClose) onClose();
        else navigate("/inventory");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const onMerge = async (other: ChemicalDetail["sameCas"][number]) => {
    const ok = await confirm({
      title: "Merge duplicate record?",
      description: (
        <>
          All {other.containerCount} container(s) from <b>{other.name}</b> will move into <b>{chemical.name}</b>. “{other.name}” is kept as a
          searchable synonym and its spreadsheet provenance is preserved.
        </>
      ),
      confirmLabel: "Merge records",
    });
    if (!ok) return;
    merge.mutate(other.id, { onSuccess: () => toast.success("Records merged"), onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className={cn(!compact && "md:mb-2")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={chemical.status} />
              {chemical.priority && <PriorityBadge priority={chemical.priority} />}
              {chemical.order && <OrderedBadge />}
              {primary && <CategoryBadge name={primary.name} color={primary.color} icon={primary.icon} />}
            </div>
            <h1 className={cn("font-extrabold tracking-[-0.02em] text-ink", compact ? "text-[22px]" : "text-[28px] md:text-[40px] md:leading-tight")}>{chemical.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {chemical.cas ? (
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(chemical.cas!);
                    toast.success(`Copied ${chemical.cas}`);
                  }}
                  className={cn("inline-flex items-center gap-1.5 font-mono text-[13px] font-medium hover:text-ink", chemical.casValid ? "text-ink-2" : "text-warning-700")}
                  title="Copy CAS number"
                >
                  CAS {chemical.cas} <Copy className="size-3.5 opacity-60" />
                </button>
              ) : (
                <span className="text-muted">No CAS number</span>
              )}
              {chemical.formula && <span className="font-mono text-[13px] text-ink-2">{chemical.formula}</span>}
              {chemical.molecularWeight && <span className="text-ink-2 tabular">{chemical.molecularWeight} g/mol</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onClose && (
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
                <X />
              </Button>
            )}
          </div>
        </div>
        <div className={cn("mt-4 grid grid-cols-3 gap-2", !compact && "md:flex md:flex-wrap")}>
          <Button variant="primary" size="md" onClick={() => actions.addContainer(chemical)} className="max-md:px-2">
            <PackagePlus /> <span className="max-[380px]:hidden">Add stock</span>
          </Button>
          <Button variant="secondary" onClick={() => actions.updateAvailability(chemical)} disabled={!containers.length} className="max-md:px-2">
            <Percent /> <span className="max-[380px]:hidden">Availability</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="max-md:px-2">
                <MoreHorizontal /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil /> Edit chemical
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!containers.length} onSelect={() => actions.changeLocation(chemical)}>
                <MapPinned /> Change storage location
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setClassOpen(true)}>
                <Tags /> Edit classification
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!chemical.cas || !chemical.casValid}
                onSelect={() =>
                  pubchem.mutate(undefined, {
                    onSuccess: () => toast.success("Verified identity data added from PubChem"),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                <Database /> Fetch from PubChem
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {!chemical.order && (
                <DropdownMenuItem onSelect={() => actions.markOrdered(chemical)}>
                  <Truck /> Mark as ordered
                </DropdownMenuItem>
              )}
              {chemical.priority !== "critical" && (
                <DropdownMenuItem onSelect={() => actions.setPriority(chemical, "critical")}>
                  <Flame /> Mark as critical
                </DropdownMenuItem>
              )}
              {chemical.priority !== "watchlist" && (
                <DropdownMenuItem onSelect={() => actions.setPriority(chemical, "watchlist")}>
                  <Eye /> Add to watchlist
                </DropdownMenuItem>
              )}
              {chemical.priority && (
                <DropdownMenuItem onSelect={() => actions.setPriority(chemical, null)}>
                  <X /> Clear alert priority
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!containers.some((c) => (c.remainingPercentage ?? 0) > 0)}
                onSelect={async () => {
                  const target = containers.filter((c) => (c.remainingPercentage ?? 0) > 0);
                  if (target.length === 1) return actions.markUnavailable(chemical, target[0]);
                  const ok = await confirm({
                    title: "Mark all containers unavailable?",
                    description: `All ${target.length} containers of ${chemical.name} will be set to 0%.`,
                    confirmLabel: "Mark all unavailable",
                    destructive: true,
                  });
                  if (!ok) return;
                  markAll.mutate(target.map((c) => c.id), {
                    onSuccess: () => toast.success(`${chemical.name} marked as out of stock`),
                    onError: (e) => toast.error(e.message),
                  });
                }}
              >
                <Ban /> Mark as unavailable
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={onDelete}>
                <Trash2 /> Delete record
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {reviewRecords.map((r) => (
        <div key={r.id} className="rounded-[20px] border border-review/25 bg-review-50/70 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-review" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Containers need manual pairing</p>
              <p className="mt-1 text-[13px] text-ink-2">{r.issues.find((i) => i.level === "review")?.message}</p>
              <div className="mt-2 grid gap-1 text-xs text-ink-2 sm:grid-cols-2">
                <span>Brand: <span className="font-mono">{r.raw.brand ?? "—"}</span></span>
                <span>Quantity: <span className="font-mono">{r.raw.quantity ?? "—"}</span></span>
                <span>Available: <span className="font-mono">{r.raw.available ?? "—"}</span></span>
                <span>Location: <span className="font-mono">{r.raw.location ?? "—"}</span></span>
              </div>
              <Button size="sm" variant="primary" className="mt-3" onClick={() => setResolving(r)}>
                Pair containers
              </Button>
            </div>
          </div>
        </div>
      ))}

      {allIssues.length > 0 && (
        <div className="rounded-[20px] border border-warning/30 bg-warning-50/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Info className="size-4 text-warning-700" /> Data notes from import
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
            {allIssues.map((i, k) => (
              <li key={k}>• {i.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-4", !compact && "xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}>
        <div className="space-y-4">
          <Section
            title="Availability and stock"
            icon={<Percent />}
          >
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Best container" value={formatPct(chemical.bestPct)} tone={STATUS_STYLE[chemical.status].text} />
              <Metric label="Containers" value={`${available}/${containers.length}`} hint="with stock" />
              <Metric label="Est. remaining" value={totals.size ? [...totals].map(([u, v]) => formatQuantity(v, u)).join(" + ") : "—"} small />
            </div>
            {chemical.status !== "review" && (
              <p className="mt-3 text-xs text-muted">
                Overall status <b className={STATUS_STYLE[chemical.status].text}>{STATUS_LABEL[chemical.status]}</b> is based on the fullest container. Each container below keeps its own availability.
              </p>
            )}
            {chemical.order ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[20px] bg-ordered-soft p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ordered-text">
                  <Truck className="size-5" />
                </span>
                <div className="min-w-0 flex-1 text-[13px] text-ink-2">
                  <p className="font-semibold text-ink">On order since {formatDate(chemical.order.orderedOn)}</p>
                  <p>
                    {[chemical.order.supplier, chemical.order.expectedOn && `expected ${formatDate(chemical.order.expectedOn)}`, chemical.order.notes]
                      .filter(Boolean)
                      .join(" · ") || "No supplier or arrival date recorded"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => actions.cancelOrder(chemical, chemical.order!.id)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => actions.receiveOrder(chemical, chemical.order!.id)}>
                    Received
                  </Button>
                </div>
              </div>
            ) : (
              (chemical.status === "low" || chemical.status === "out") && (
                <Button size="sm" variant="tonal" className="mt-3" onClick={() => actions.markOrdered(chemical)}>
                  <Truck /> Mark as ordered
                </Button>
              )
            )}
          </Section>

          <Section
            title={`Container details (${containers.length})`}
            icon={<PackagePlus />}
            action={
              <Button size="sm" variant="secondary" onClick={() => actions.addContainer(chemical)}>
                <Plus /> Add
              </Button>
            }
          >
            {containers.length ? (
              <div className={cn("grid gap-2.5", !compact && "sm:grid-cols-2")}>
                {containers.map((c) => (
                  <ContainerCard key={c.id} c={c} chemical={chemical} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{reviewRecords.length ? "Containers will appear here after pairing the source values above." : "No stock containers recorded yet."}</p>
            )}
          </Section>

          <Section title="Storage information" icon={<MapPin />}>
            {locations.size || unpairedLocations.length ? (
              <div className="flex flex-wrap gap-2">
                {[...locations].map(([name, n]) => (
                  <Link key={name} to={`/locations?focus=${encodeURIComponent(name)}`} className="group flex items-center gap-2 rounded-[14px] border border-line px-3 py-2 transition hover:border-navy/30 hover:bg-navy-50/50">
                    <MapPin className="size-4 text-navy" />
                    <span className="font-mono text-sm font-semibold text-navy">{name}</span>
                    <span className="text-xs text-muted">{n} container{n === 1 ? "" : "s"}</span>
                  </Link>
                ))}
                {unpairedLocations.map((name) => (
                  <Link key={name} to={`/locations?focus=${encodeURIComponent(name)}`} className="group flex items-center gap-2 rounded-[14px] border border-dashed border-review/40 px-3 py-2 transition hover:bg-review-50/50">
                    <MapPin className="size-4 text-review" />
                    <span className="font-mono text-sm font-semibold text-navy">{name}</span>
                    <span className="text-xs text-muted">listed in source row</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No storage location recorded.</p>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Chemical identity" icon={<Info />} action={<Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}>
            <dl className="-my-2 divide-y divide-line">
              <Row label="Name">{chemical.name}</Row>
              <Row label="CAS number" mono>
                {chemical.cas ?? "—"}
                {chemical.cas && !chemical.casValid && <span className="ml-2 font-sans text-xs text-warning-700">check digit invalid</span>}
              </Row>
              <Row label="Formula" mono>{chemical.formula ?? <span className="font-sans text-muted">Not verified</span>}</Row>
              <Row label="Mol. weight">{chemical.molecularWeight ? `${chemical.molecularWeight} g/mol` : <span className="text-muted">Not verified</span>}</Row>
              {chemical.iupacName && <Row label="IUPAC name">{chemical.iupacName}</Row>}
              <Row label="Identity source">
                {chemical.pubchemCid ? (
                  <a href={`https://pubchem.ncbi.nlm.nih.gov/compound/${chemical.pubchemCid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal hover:underline">
                    PubChem CID {chemical.pubchemCid} <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted">{chemical.identitySource ?? "Spreadsheet only"}</span>
                )}
              </Row>
            </dl>
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-medium text-ink-2">Synonyms & abbreviations <span className="font-normal text-muted">· searchable</span></p>
              <div className="flex flex-wrap gap-1.5">
                {chemical.synonyms.map((s) => (
                  <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted py-0.5 pl-2.5 pr-1 text-xs text-ink-2" title={`Source: ${s.source}`}>
                    {s.synonym}
                    <button onClick={() => rmSyn.mutate(s.id)} className="grid size-4 place-items-center rounded-full text-muted opacity-60 hover:bg-line hover:opacity-100" aria-label={`Remove synonym ${s.synonym}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {!chemical.synonyms.length && <span className="text-xs text-muted">None yet</span>}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSyn.trim()) return;
                  addSyn.mutate(newSyn.trim(), { onSuccess: () => { setNewSyn(""); toast.success("Synonym added"); }, onError: (er) => toast.error(er.message) });
                }}
              >
                <Input value={newSyn} onChange={(e) => setNewSyn(e.target.value)} placeholder="Add synonym or abbreviation" className="h-9" />
                <Button size="sm" variant="secondary" type="submit" className="h-9" loading={addSyn.isPending}>
                  Add
                </Button>
              </form>
            </div>
          </Section>

          <Section title="Classification and tags" icon={<Tags />} action={<Button size="sm" variant="ghost" onClick={() => setClassOpen(true)}><Pencil /> Edit</Button>}>
            <div className="flex flex-wrap gap-1.5">
              {chemical.categories.map((c) => (
                <Link key={c.id} className="max-w-full" to={`/categories/${c.parentSlug ?? c.slug}${c.parentSlug ? `?sub=${c.slug}` : ""}`}>
                  <CategoryBadge name={c.parentName ? `${c.parentName} › ${c.name}` : c.name} color={c.color} icon={c.icon} className={cn(c.isPrimary && "ring-1 ring-current/30")} />
                </Link>
              ))}
            </div>
            <dl className="mt-3 divide-y divide-line">
              <Row label="Chemical class">{chemical.chemicalClass ?? <span className="text-muted">—</span>}</Row>
              <Row label="Basis">
                <span className="capitalize">{chemical.classificationSource}</span>
                <span className="block text-xs text-muted">{SOURCE_EXPLAIN[chemical.classificationSource]}</span>
              </Row>
            </dl>
            {chemical.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chemical.tags.map((t) => (
                  <Link key={t} to={`/inventory?tag=${encodeURIComponent(t)}`} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-ink-2 ring-1 ring-line hover:ring-line-strong">
                    #{t}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-[14px] bg-surface-muted p-3 text-xs">
              <ShieldAlert className="mt-px size-4 shrink-0 text-muted" />
              {chemical.hazardClassification ? (
                <div>
                  <p className="font-medium text-ink">{chemical.hazardClassification}</p>
                  <p className="text-muted">Source: {chemical.hazardSource}</p>
                </div>
              ) : (
                <p className="text-muted">No verified hazard classification recorded. Always consult the supplier SDS before use.</p>
              )}
            </div>
          </Section>

          <Section title="Additional notes" icon={<Pencil />} action={<Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}>
            {chemical.notes || chemical.description ? (
              <div className="space-y-2 whitespace-pre-wrap text-sm text-ink-2">
                {chemical.description && <p>{chemical.description}</p>}
                {chemical.notes && <p>{chemical.notes}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted">No notes yet.</p>
            )}
          </Section>

          {chemical.sameCas.length > 0 && (
            <Card className="p-4 md:p-5">
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <ArrowRightLeft className="size-4 text-navy" /> Other records with this CAS
              </h2>
              <p className="mb-3 text-xs text-muted">These were separate rows in the spreadsheet. Merge them only if they are the same product (not, for example, different silica grades).</p>
              <div className="space-y-2">
                {chemical.sameCas.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-3 py-2">
                    <Link to={`/chemicals/${s.id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:text-teal">
                      {s.name} <span className="text-xs font-normal text-muted">· {s.containerCount} container{s.containerCount === 1 ? "" : "s"}</span>
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => onMerge(s)} loading={merge.isPending}>
                      Merge here
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 md:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
              <FileSpreadsheet className="size-4 text-navy" /> Source & history
            </h2>
            {chemical.importRecords.map((r) => (
              <div key={r.id} className="mb-3 rounded-[14px] bg-surface-muted p-3 text-xs">
                <p className="mb-1.5 font-medium text-ink">
                  {r.fileName} · row {r.originalRow}
                  <span className="ml-2 rounded bg-surface px-1.5 py-px text-[11px] font-normal text-muted ring-1 ring-line">{r.status.replaceAll("_", " ")}</span>
                </p>
                <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-0.5 font-mono text-[11.5px] text-ink-2">
                  <span className="font-sans text-muted">Sr. No.</span><span>{r.raw.srNo ?? "—"}</span>
                  <span className="font-sans text-muted">Name</span><span>{r.raw.name ?? "—"}</span>
                  <span className="font-sans text-muted">CAS No.</span><span>{r.raw.cas ?? "—"}</span>
                  <span className="font-sans text-muted">Brand</span><span>{r.raw.brand ?? "—"}</span>
                  <span className="font-sans text-muted">Quantity</span><span>{r.raw.quantity ?? "—"}</span>
                  <span className="font-sans text-muted">Available</span><span>{r.raw.available ?? "—"}</span>
                  <span className="font-sans text-muted">Location</span><span>{r.raw.location ?? "—"}</span>
                </div>
              </div>
            ))}
            {chemical.activity.length > 0 && (
              <ul className="space-y-2">
                {chemical.activity.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs text-ink-2">
                    <History className="size-3.5 shrink-0 text-muted" />
                    <span className="flex-1">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {typeof a.detail.remainingPercentage === "number" && <> → {String(a.detail.remainingPercentage)}%</>}
                      {typeof a.detail.location === "string" && a.action === "location_changed" && <> → {a.detail.location}</>}
                    </span>
                    <span className="text-muted">{timeAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editOpen && <EditChemicalDialog chemical={chemical} open={editOpen} onOpenChange={setEditOpen} />}
      {classOpen && <ClassificationDialog chemical={chemical} open={classOpen} onOpenChange={setClassOpen} />}
      {resolving && <ResolveDialog chemical={chemical} record={resolving} open onOpenChange={(o) => !o && setResolving(null)} />}
    </div>
  );
}

function Metric({ label, value, hint, tone, small }: { label: string; value: string; hint?: string; tone?: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-[20px] bg-surface-muted px-3.5 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={cn("mt-1 font-extrabold tracking-[-0.02em] tabular text-ink", small ? "text-sm leading-7" : "text-[28px] leading-none", tone)}>{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

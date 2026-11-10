import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import type { AlertPriority, ChemicalListItem, ContainerSummary } from "@shared/types";
import { formatQuantity, parsePackSize, stockStatus, STATUS_LABEL } from "@shared/stock";
import { api, useInventoryMutation, useLocationCheck, useMeta } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal, useConfirm } from "@/components/ui/overlays";
import { LocationBadge, StatusBadge, StockBar } from "./bits";

type Mode = "add" | "edit" | "availability" | "location";

interface OpenState {
  mode: Mode;
  chemical: Pick<ChemicalListItem, "id" | "name" | "containers">;
  containerId: number | null;
}

interface Actions {
  addContainer: (c: OpenState["chemical"]) => void;
  editContainer: (c: OpenState["chemical"], containerId: number) => void;
  updateAvailability: (c: OpenState["chemical"], containerId?: number) => void;
  changeLocation: (c: OpenState["chemical"], containerId?: number) => void;
  markUnavailable: (c: OpenState["chemical"], container: ContainerSummary) => Promise<void>;
  deleteContainer: (c: OpenState["chemical"], container: ContainerSummary) => Promise<void>;
  markOrdered: (c: ChemRef) => void;
  receiveOrder: (c: ChemRef, orderId: number) => Promise<void>;
  cancelOrder: (c: ChemRef, orderId: number) => Promise<void>;
  setPriority: (c: ChemRef, priority: AlertPriority | null) => void;
}

type ChemRef = Pick<ChemicalListItem, "id" | "name">;

export const PRIORITY_LABEL: Record<AlertPriority, string> = { critical: "Critical", watchlist: "Watchlist" };

const Ctx = createContext<Actions | null>(null);

export function useChemActions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ChemActionsProvider missing");
  return ctx;
}

const describe = (c: ContainerSummary) => [c.brand, c.packSize, c.location].filter(Boolean).join(" · ") || `Container #${c.id}`;

export function ChemActionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null);
  const [ordering, setOrdering] = useState<ChemRef | null>(null);
  const confirm = useConfirm();
  const closeOrder = useInventoryMutation((v: { orderId: number; status: "received" | "cancelled" }) =>
    api(`/reorders/${v.orderId}`, { method: "PATCH", json: { status: v.status } }),
  );
  const priority = useInventoryMutation((v: { id: number; priority: AlertPriority | null }) =>
    api(`/chemicals/${v.id}/priority`, { method: "PUT", json: { priority: v.priority } }),
  );
  const patch = useInventoryMutation((v: { id: number; body: Record<string, unknown> }) =>
    api(`/containers/${v.id}`, { method: "PATCH", json: v.body }),
  );
  const del = useInventoryMutation((id: number) => api(`/containers/${id}`, { method: "DELETE" }));

  const firstEditable = (c: OpenState["chemical"]) => c.containers.find((x) => !x.needsReview)?.id ?? null;

  const actions = useMemo<Actions>(
    () => ({
      addContainer: (chemical) => setState({ mode: "add", chemical, containerId: null }),
      editContainer: (chemical, containerId) => setState({ mode: "edit", chemical, containerId }),
      updateAvailability: (chemical, containerId) =>
        setState({ mode: "availability", chemical, containerId: containerId ?? firstEditable(chemical) }),
      changeLocation: (chemical, containerId) =>
        setState({ mode: "location", chemical, containerId: containerId ?? firstEditable(chemical) }),
      markUnavailable: async (chemical, container) => {
        const ok = await confirm({
          title: "Mark container as unavailable?",
          description: (
            <>
              <b>{chemical.name}</b> ({describe(container)}) will be set to 0% and shown as out of stock. You can update the
              availability again at any time.
            </>
          ),
          confirmLabel: "Mark unavailable",
          destructive: true,
        });
        if (!ok) return;
        await patch.mutateAsync({ id: container.id, body: { remainingPercentage: 0 } }).then(
          () => toast.success(`${chemical.name} marked as out of stock`),
          (e) => toast.error(e.message),
        );
      },
      deleteContainer: async (chemical, container) => {
        const ok = await confirm({
          title: "Delete this container?",
          description: (
            <>
              This removes the stock record <b>{describe(container)}</b> from {chemical.name}. Use this only for records that
              were entered by mistake. This cannot be undone.
            </>
          ),
          confirmLabel: "Delete container",
          destructive: true,
        });
        if (!ok) return;
        await del.mutateAsync(container.id).then(
          () => toast.success("Container deleted"),
          (e) => toast.error(e.message),
        );
      },
      markOrdered: (chemical) => setOrdering(chemical),
      receiveOrder: async (chemical, orderId) => {
        const ok = await confirm({
          title: "Mark order as received?",
          description: (
            <>
              The order for <b>{chemical.name}</b> will be closed. Next, add the new container so stock levels stay accurate.
            </>
          ),
          confirmLabel: "Received, add stock",
        });
        if (!ok) return;
        await closeOrder.mutateAsync({ orderId, status: "received" }).then(
          () => {
            toast.success("Order received");
            setState({ mode: "add", chemical: { ...chemical, containers: [] }, containerId: null });
          },
          (e) => toast.error(e.message),
        );
      },
      cancelOrder: async (chemical, orderId) => {
        const ok = await confirm({
          title: "Cancel this order?",
          description: <>{chemical.name} will show as needing a reorder again if it is still low or out of stock.</>,
          confirmLabel: "Cancel order",
          destructive: true,
        });
        if (!ok) return;
        await closeOrder.mutateAsync({ orderId, status: "cancelled" }).then(
          () => toast.success("Order cancelled"),
          (e) => toast.error(e.message),
        );
      },
      setPriority: (chemical, p) =>
        priority.mutate(
          { id: chemical.id, priority: p },
          {
            onSuccess: () => toast.success(p ? `${chemical.name} marked ${PRIORITY_LABEL[p].toLowerCase()}` : "Priority cleared"),
            onError: (e) => toast.error(e.message),
          },
        ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm],
  );

  return (
    <Ctx.Provider value={actions}>
      {children}
      {state && <ContainerDialog key={`${state.mode}-${state.containerId}`} state={state} onClose={() => setState(null)} onSwitch={(id) => setState({ ...state, containerId: id })} />}
      {ordering && <OrderDialog chemical={ordering} onClose={() => setOrdering(null)} />}
    </Ctx.Provider>
  );
}

function ContainerDialog({ state, onClose, onSwitch }: { state: OpenState; onClose: () => void; onSwitch: (id: number) => void }) {
  const { data: meta } = useMeta();
  const editable = state.chemical.containers.filter((c) => !c.needsReview);
  const current = editable.find((c) => c.id === state.containerId) ?? null;
  const [brand, setBrand] = useState(current?.brand ?? "");
  const [packSize, setPackSize] = useState(current?.packSize ?? "");
  const [pct, setPct] = useState<number | null>(state.mode === "add" ? 100 : (current?.remainingPercentage ?? null));
  const [location, setLocation] = useState(current?.location ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [expiry, setExpiry] = useState(current?.expiryDate ?? "");
  const thresholds = meta?.thresholds;

  const save = useInventoryMutation((body: Record<string, unknown>) =>
    state.mode === "add"
      ? api(`/chemicals/${state.chemical.id}/containers`, { method: "POST", json: body })
      : api(`/containers/${state.containerId}`, { method: "PATCH", json: body }),
  );

  const title = {
    add: "Add stock container",
    edit: "Edit container",
    availability: "Update availability",
    location: "Change storage location",
  }[state.mode];

  const submit = () => {
    const body: Record<string, unknown> =
      state.mode === "availability"
        ? { remainingPercentage: pct }
        : state.mode === "location"
          ? { location: location.trim() || null }
          : {
              brand: brand.trim() || null,
              packSize: packSize.trim() || null,
              remainingPercentage: pct,
              location: location.trim() || null,
              notes: notes.trim() || null,
              expiryDate: expiry || null,
            };
    if (state.mode === "location" && !location.trim()) {
      toast.error("Enter a storage location");
      return;
    }
    save.mutate(body, {
      onSuccess: () => {
        toast.success(
          state.mode === "add" ? "Container added" : state.mode === "availability" ? `Availability set to ${pct ?? "—"}%` : state.mode === "location" ? `Moved to ${location.trim()}` : "Container updated",
        );
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const status = stockStatus(pct, thresholds);
  const pack = parsePackSize(state.mode === "add" || state.mode === "edit" ? packSize : current?.packSize);
  const remaining = pack.value !== null && pct !== null ? formatQuantity((pack.value * pct) / 100, pack.unit) : null;
  const noEditable = state.mode !== "add" && !current;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={state.chemical.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={noEditable}>
            {state.mode === "add" ? "Add container" : "Save"}
          </Button>
        </>
      }
    >
      {noEditable ? (
        <p className="rounded-[14px] bg-review-50 p-3 text-sm text-review">
          This chemical has no individually recorded containers yet. Resolve the source-row review on the chemical's detail page first.
        </p>
      ) : (
        <div className="space-y-5">
          {state.mode !== "add" && editable.length > 1 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Container</p>
              <div className="flex flex-col gap-1.5">
                {editable.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSwitch(c.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-[14px] border px-3 py-2 text-left text-sm transition",
                      c.id === state.containerId ? "border-teal bg-teal-50/60 ring-1 ring-teal" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{c.brand ?? "Unknown brand"}</span>
                      <span className="text-muted"> · {c.packSize ?? "—"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.location && <LocationBadge name={c.location} />}
                      <span className="w-10 text-right text-xs font-semibold tabular">{c.remainingPercentage ?? "—"}%</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(state.mode === "add" || state.mode === "edit") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand" className="col-span-2 sm:col-span-1">
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Finar" list="brand-options" />
              </Field>
              <Field label="Pack size" className="col-span-2 sm:col-span-1" hint="Value and unit, e.g. 500 mL">
                <Input value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="500 mL" />
              </Field>
              <datalist id="brand-options">
                {meta?.brands.map((b) => <option key={b.value} value={b.value} />)}
              </datalist>
            </div>
          )}

          {(state.mode === "add" || state.mode === "edit" || state.mode === "availability") && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-2">Remaining</span>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct ?? 0}
                  onChange={(e) => setPct(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-teal"
                  aria-label="Remaining percentage"
                />
                <div className="relative w-20 shrink-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    value={pct ?? ""}
                    onChange={(e) => setPct(e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="pr-7 text-right tabular"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {[0, 10, 25, 50, 75, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setPct(v)}
                    className={cn(
                      "h-8 flex-1 rounded-lg border text-xs font-medium tabular transition",
                      pct === v ? "border-teal bg-teal text-white" : "border-line text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {v}%
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <StockBar pct={pct} status={status} size="md" />
                <p className="mt-1.5 text-xs text-muted">
                  {remaining ? `≈ ${remaining} remaining` : "Remaining quantity is estimated from pack size × percentage."}
                  {thresholds && ` · ${STATUS_LABEL[status]} (${status === "good" ? `>${thresholds.goodAbove}%` : status === "moderate" ? `${thresholds.lowBelow}–${thresholds.goodAbove}%` : status === "low" ? `<${thresholds.lowBelow}%` : status === "out" ? "0%" : ""})`}
                </p>
              </div>
            </div>
          )}

          {(state.mode === "add" || state.mode === "edit" || state.mode === "location") && (
            <div>
              <Field label="Storage location">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. R1, F2B1, C4" list="location-options" autoFocus={state.mode === "location"} />
              </Field>
              <datalist id="location-options">
                {meta?.locations.map((l) => <option key={l.id} value={l.name} />)}
              </datalist>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meta?.locations
                  .slice()
                  .sort((a, b) => b.containerCount - a.containerCount)
                  .slice(0, state.mode === "location" ? 14 : 8)
                  .map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLocation(l.name)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 font-mono text-xs transition",
                        location === l.name ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:border-line-strong",
                      )}
                    >
                      {l.name}
                    </button>
                  ))}
              </div>
              <LocationCheck chemicalId={state.chemical.id} location={location} />
            </div>
          )}

          {(state.mode === "add" || state.mode === "edit") && (
            <Field label="Expiry date" hint="Optional. Shown under Expiring soon on the home screen 30 days before.">
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-48" />
            </Field>
          )}

          {(state.mode === "add" || state.mode === "edit") && (
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lot number, opened date, condition…" rows={2} />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Storage-compatibility warning based only on verified hazard classifications (never guessed from names). */
function LocationCheck({ chemicalId, location }: { chemicalId: number; location: string }) {
  const loc = useDebounced(location, 300);
  const { data } = useLocationCheck(chemicalId, loc);
  if (!data || !loc.trim()) return null;
  if (data.conflicts.length) {
    return (
      <div className="mt-3 rounded-[14px] border border-warning/40 bg-warning-50 p-3 text-[13px] text-warning-700">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert className="size-4" /> Possible incompatibility in {loc.trim()}
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {data.conflicts.map((c) => (
            <li key={c.chemicalId}>
              {c.name}: {c.reason}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs opacity-80">Based on verified hazard classifications only. You can still save.</p>
      </div>
    );
  }
  return (
    <p className="mt-2 text-xs text-muted">
      {data.hasVerifiedHazard
        ? `No conflicts with the ${data.verifiedNeighbours} chemical${data.verifiedNeighbours === 1 ? "" : "s"} in ${loc.trim()} that have verified hazard data.`
        : "Compatibility not checked: this chemical has no verified hazard classification."}
    </p>
  );
}

function OrderDialog({ chemical, onClose }: { chemical: ChemRef; onClose: () => void }) {
  const [supplier, setSupplier] = useState("");
  const [orderedOn, setOrderedOn] = useState(new Date().toISOString().slice(0, 10));
  const [expectedOn, setExpectedOn] = useState("");
  const [notes, setNotes] = useState("");
  const save = useInventoryMutation((body: Record<string, unknown>) => api(`/chemicals/${chemical.id}/reorder`, { method: "POST", json: body }));
  const submit = () =>
    save.mutate(
      { supplier: supplier.trim() || null, orderedOn: orderedOn || null, expectedOn: expectedOn || null, notes: notes.trim() || null },
      {
        onSuccess: () => {
          toast.success(`${chemical.name} marked as ordered`);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark as ordered"
      description={chemical.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Mark as ordered
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier (optional)" className="col-span-2">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Sigma-Aldrich" autoFocus />
        </Field>
        <Field label="Order date">
          <Input type="date" value={orderedOn} onChange={(e) => setOrderedOn(e.target.value)} />
        </Field>
        <Field label="Expected arrival (optional)">
          <Input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
        </Field>
        <Field label="Notes (optional)" className="col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="PO number, quantity ordered…" rows={2} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">Ordered chemicals stop counting as urgent until the order is received or cancelled.</p>
    </Modal>
  );
}

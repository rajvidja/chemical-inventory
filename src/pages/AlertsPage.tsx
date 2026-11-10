import { BellOff, Percent, Settings2, Truck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { ChemicalDetail } from "@shared/types";
import { formatQuantity } from "@shared/stock";
import { api, recordAccess, useAlerts, useOpenOrders } from "@/lib/api";
import { cn, formatDate, formatPct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";
import { Cas, LocationBadge, OrderedBadge, PriorityBadge, STATUS_STYLE, StatusBadge, StockBar } from "@/components/chem/bits";
import { useChemActions } from "@/components/chem/ChemActions";

type Tab = "all" | "low" | "out" | "ordered";
const STATUSES: Record<Exclude<Tab, "ordered">, string[]> = { all: ["low", "out"], low: ["low"], out: ["out"] };

export default function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (["low", "out", "ordered"].includes(params.get("status") ?? "") ? params.get("status") : "all") as Tab;
  const { data, isLoading } = useAlerts(STATUSES[tab === "ordered" ? "all" : tab]);
  const orders = useOpenOrders();
  const actions = useChemActions();
  const navigate = useNavigate();
  const t = data?.thresholds;

  const update = async (chemicalId: number, containerId: number) => {
    try {
      const chem = await api<ChemicalDetail>(`/chemicals/${chemicalId}`);
      actions.updateAvailability(chem, containerId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Stock alerts"
        subtitle={t ? `Containers below ${t.lowBelow}% are low; 0% is out of stock. Each container is tracked separately.` : "Containers that are running low or empty."}
        actions={
          <Button variant="secondary" asChild>
            <Link to="/settings">
              <Settings2 /> <span className="max-sm:hidden">Thresholds</span>
            </Link>
          </Button>
        }
      />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === "all" ? {} : { status: v }, { replace: true })}
        options={[
          { value: "all", label: "All" },
          { value: "low", label: "Low" },
          { value: "out", label: "Out" },
          { value: "ordered", label: `On order${orders.data?.items.length ? ` · ${orders.data.items.length}` : ""}` },
        ]}
      />

      {tab === "ordered" ? (
        <Card className="divide-y divide-line overflow-hidden">
          {orders.data?.items.map((o) => (
            <div key={o.chemicalId} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  recordAccess(o.chemicalId, "browse");
                  navigate(`/chemicals/${o.chemicalId}`);
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold text-ink hover:text-teal">{o.name}</p>
                  {o.priority && <PriorityBadge priority={o.priority} />}
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Ordered {formatDate(o.order!.orderedOn)}
                  {o.order!.supplier && ` · ${o.order!.supplier}`}
                  {o.order!.expectedOn && ` · expected ${formatDate(o.order!.expectedOn)}`}
                </p>
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => actions.cancelOrder({ id: o.chemicalId, name: o.name }, o.order!.id)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => actions.receiveOrder({ id: o.chemicalId, name: o.name }, o.order!.id)}>
                  Received
                </Button>
              </div>
            </div>
          ))}
          {orders.data && !orders.data.items.length && (
            <EmptyState icon={<Truck />} title="Nothing on order" description="Use “Mark as ordered” on a low or empty chemical to track a reorder." />
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          {data?.items.map((a) => {
            const qty = formatQuantity(a.remainingQuantity, a.packUnit);
            return (
              <div key={a.containerId} className="flex flex-col gap-3 p-4 transition hover:bg-surface-muted/50 md:flex-row md:items-center">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    recordAccess(a.chemicalId, "browse");
                    navigate(`/chemicals/${a.chemicalId}`);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-ink hover:text-teal">{a.chemicalName}</p>
                    {a.priority && <PriorityBadge priority={a.priority} />}
                    <StatusBadge status={a.status} />
                    {a.order && <OrderedBadge />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <Cas cas={a.cas} />
                    <span>{[a.brand, a.packSize].filter(Boolean).join(" · ") || "Unknown brand"}</span>
                    {a.location && <LocationBadge name={a.location} />}
                  </div>
                  {a.otherAvailable > 0 && (
                    <p className="mt-1.5 text-xs text-success">
                      {a.otherAvailable} other container{a.otherAvailable === 1 ? "" : "s"} still in stock
                    </p>
                  )}
                </button>
                <div className="flex items-center gap-3 md:w-[300px]">
                  <div className="flex-1">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className={cn("text-lg font-semibold tabular", STATUS_STYLE[a.status].text)}>{formatPct(a.remainingPercentage)}</span>
                      {qty && <span className="text-xs text-muted">≈ {qty} left</span>}
                    </div>
                    <StockBar pct={a.remainingPercentage} status={a.status} showLabel={false} size="md" />
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => update(a.chemicalId, a.containerId)}>
                    <Percent /> Update
                  </Button>
                  {!a.order && a.otherAvailable === 0 && (
                    <Button variant="secondary" size="sm" onClick={() => actions.markOrdered({ id: a.chemicalId, name: a.chemicalName })} aria-label="Mark as ordered">
                      <Truck /> <span className="max-sm:hidden">Ordered</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {data && !data.items.length && (
            <EmptyState icon={<BellOff />} title="No alerts" description={tab === "out" ? "No containers are empty." : "Every container is above the low-stock threshold."} />
          )}
        </Card>
      )}
    </div>
  );
}

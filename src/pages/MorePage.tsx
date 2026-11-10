import { BarChart3, Bell, ChevronRight, FileSpreadsheet, ListChecks, MapPin, Plus, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useDashboard, useMeta } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";

export default function MorePage() {
  const { data: meta } = useMeta();
  const { data: dash } = useDashboard();
  const alerts = dash ? dash.attention.low + dash.attention.out : 0;
  const items = [
    { to: "/chemicals/new", label: "Add chemical", hint: "Create a record with containers", icon: Plus },
    { to: "/locations", label: "Storage locations", hint: meta ? `${meta.locations.length} locations` : undefined, icon: MapPin },
    { to: "/alerts", label: "Stock alerts", hint: alerts ? `${alerts} chemicals low or out` : "Nothing running low", icon: Bell, badge: alerts },
    { to: "/insights", label: "Insights", hint: "Totals, stock health and usage trends", icon: BarChart3 },
    { to: "/review", label: "Data review", hint: "Rows that need a human check", icon: ListChecks, badge: meta?.reviewCount },
    { to: "/import", label: "Import & export", hint: "Excel and CSV", icon: FileSpreadsheet },
    { to: "/settings", label: "Settings", hint: "Stock thresholds", icon: Settings },
  ];
  return (
    <div className="animate-fade-in">
      <PageHeader title="More" />
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-muted/60 active:bg-surface-muted">
            <span className="grid size-11 place-items-center rounded-full bg-sunken text-ink">
              <i.icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-ink">{i.label}</span>
              {i.hint && <span className="block truncate text-xs text-muted">{i.hint}</span>}
            </span>
            {!!i.badge && <span className="rounded-full bg-warning-50 px-2 text-xs font-semibold text-warning-700 tabular">{i.badge}</span>}
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
      </Card>
    </div>
  );
}

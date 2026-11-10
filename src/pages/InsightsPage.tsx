import { ArrowUpRight, ChevronsUp, Hourglass } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { InsightsResponse } from "@shared/types";
import { STATUS_LABEL, type StockStatus } from "@shared/stock";
import { useInsights } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/primitives";
import { categoryTint, STATUS_STYLE } from "@/components/chem/bits";

const card = "rounded-[28px] bg-surface p-5 shadow-[var(--shadow-1)]";
const cardTitle = "text-lg font-bold tracking-[-0.01em] text-ink";

function Total({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <span className="flex min-h-10 items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</span>
        {to && (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white">
            <ArrowUpRight className="size-5" />
          </span>
        )}
      </span>
      <span className="mt-3 block text-[40px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular">{value.toLocaleString()}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cn(card, "block transition hover:shadow-[var(--shadow-2)]")}>
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  );
}

function GaugeCard({ stats }: { stats: InsightsResponse["stats"] }) {
  const tracked = stats.totalRecords - stats.unknown;
  const pct = tracked ? Math.round(((stats.good + stats.moderate) / tracked) * 100) : 0;
  return (
    <div className={cn(card, "flex flex-col")}>
      <p className={cardTitle}>Stock health</p>
      <div className="relative mx-auto mt-3 w-full max-w-[240px]">
        <svg viewBox="0 0 180 100" className="w-full" aria-hidden>
          <path d="M 22 92 A 68 68 0 0 1 158 92" fill="none" stroke="var(--color-sunken)" strokeWidth="24" strokeLinecap="round" pathLength={100} />
          <path d="M 22 92 A 68 68 0 0 1 158 92" fill="none" stroke="var(--color-good)" strokeWidth="24" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-[40px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular">{pct}%</p>
          <p className="mt-0.5 text-[12px] font-semibold text-muted">well stocked</p>
        </div>
      </div>
      <p className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-surface-muted py-1 pl-1 pr-3 text-[12px] font-medium text-ink-2">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-white">
          <ChevronsUp className="size-3.5" />
        </span>
        Good or moderate, out of {tracked} records with a recorded level
      </p>
    </div>
  );
}

function StatusBreakdown({ data }: { data: InsightsResponse["statusDistribution"] }) {
  const order: StockStatus[] = ["good", "moderate", "low", "out", "unknown", "review"];
  const total = data.reduce((n, d) => n + d.count, 0) || 1;
  const byStatus = new Map(data.map((d) => [d.status, d.count]));
  return (
    <div className={card}>
      <p className={cn(cardTitle, "mb-4")}>By status</p>
      <div className="flex h-4 gap-1 overflow-hidden rounded-full">
        {order.map((s) => (
          <span key={s} className={cn("rounded-full", STATUS_STYLE[s].bar)} style={{ width: `${((byStatus.get(s) ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
        {order.map((s) => (
          <li key={s}>
            <Link to={`/inventory?status=${s}`} className="flex h-11 items-center gap-2 rounded-full bg-surface-muted px-3.5 transition hover:bg-sunken">
              <span className={cn("size-2.5 rounded-full", STATUS_STYLE[s].dot)} />
              <span className="flex-1 truncate font-semibold text-ink-2">{STATUS_LABEL[s]}</span>
              <span className="font-extrabold text-ink tabular">{byStatus.get(s) ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryBars({ data, total }: { data: InsightsResponse["categoryDistribution"]; total: number }) {
  const top = data.slice(0, 6);
  const max = Math.max(1, ...top.map((d) => d.count));
  return (
    <div className={card}>
      <p className={cn(cardTitle, "mb-4")}>Categories</p>
      <ul className="space-y-3">
        {top.map((d) => {
          const t = categoryTint(d.name, d.color);
          return (
            <li key={d.slug}>
              <Link to={`/categories/${d.slug}`} className="group block">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate font-semibold text-ink-2 group-hover:text-ink">{d.name}</span>
                  <span className="shrink-0 font-semibold text-muted tabular">
                    {d.count} · {Math.round((d.count / Math.max(total, 1)) * 100)}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: t.soft }}>
                  <div className="h-full rounded-full" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: t.solid }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeeklyActivity({ data }: { data: InsightsResponse["weeklyActivity"] }) {
  const max = Math.max(1, ...data.map((w) => w.updates + w.added));
  const total = data.reduce((n, w) => n + w.updates + w.added, 0);
  return (
    <div className={card}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className={cardTitle}>Usage, last 8 weeks</p>
        <p className="text-xs font-semibold text-muted">{total} changes</p>
      </div>
      <div className="flex h-[140px] items-end gap-2">
        {data.map((w, i) => {
          const h = ((w.updates + w.added) / max) * 120;
          return (
            <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`Week of ${w.week}: ${w.updates} stock updates, ${w.added} additions`}>
              <div className="flex w-full flex-col justify-end gap-0.5 overflow-hidden" style={{ height: `${Math.max(4, h)}px` }}>
                {w.added > 0 && <div className="rounded-[6px] bg-mint" style={{ flex: w.added }} />}
                <div className={cn("rounded-[6px]", i === data.length - 1 ? "bg-ink" : "bg-sky")} style={{ flex: w.updates || (w.added ? 0 : 1) }} />
              </div>
              <span className="text-[10.5px] font-semibold text-muted tabular">{w.week.slice(5).replace("-", "/")}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-sky" /> Stock updates and moves
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-mint" /> Containers and chemicals added
        </span>
      </div>
    </div>
  );
}

const SERIES = [
  { key: "low", label: "Low", color: "var(--color-low)" },
  { key: "out", label: "Out", color: "var(--color-ink)" },
] as const;

function TrendCard({ history }: { history: InsightsResponse["history"] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (history.length < 2) {
    return (
      <div className={cn(card, "md:col-span-2")}>
        <p className={cardTitle}>Low and out of stock over time</p>
        <div className="mt-4 flex items-center gap-4 rounded-[20px] bg-cream p-5 text-cream-text">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface">
            <Hourglass className="size-5" />
          </span>
          <p className="text-sm font-semibold">
            Collecting data. A snapshot of the counts is saved each day the app is used; the trend line appears from the second day.
            {history[0] && ` First snapshot: ${formatDate(history[0].day)}.`}
          </p>
        </div>
      </div>
    );
  }
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 16, b: 8 };
  const max = Math.max(1, ...history.flatMap((d) => [d.low, d.out]));
  const x = (i: number) => pad.l + (i / (history.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (k: "low" | "out") => history.map((d, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(d[k]).toFixed(1)}`).join(" ");
  const first = history[0];
  const last = history[history.length - 1];
  const h = hover !== null ? history[hover] : null;
  return (
    <div className={cn(card, "md:col-span-2")}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className={cardTitle}>Low and out of stock over time</p>
        <div className="flex gap-3 text-xs font-semibold text-muted">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">
        From {formatDate(first.day)} to {formatDate(last.day)}, low went from {first.low} to {last.low} and out of stock from {first.out} to {last.out}.
      </p>
      <div
        className="relative"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - r.left) / r.width) * (history.length - 1)));
        }}
        aria-hidden
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--color-line)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          ))}
          {SERIES.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-[var(--shadow-3)]"
            style={{ left: `${Math.min(80, Math.max(20, (x(hover) / W) * 100))}%` }}
          >
            {formatDate(h.day, false)} · {h.low} low · {h.out} out
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted tabular">
        <span>{formatDate(first.day, false)}</span>
        <span>{formatDate(last.day, false)}</span>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const { data } = useInsights();
  return (
    <div className="animate-fade-in">
      <PageHeader title="Insights" subtitle="Totals, stock health and usage trends across the whole inventory." />
      {!data ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-[28px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Total label="Records" value={data.stats.totalRecords} to="/inventory" />
            <Total label="Unique chemicals" value={data.stats.uniqueChemicals} />
            <Total label="Containers" value={data.stats.totalContainers} />
            <Total label="Locations" value={data.stats.locations} to="/locations" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TrendCard history={data.history} />
            <GaugeCard stats={data.stats} />
            <StatusBreakdown data={data.statusDistribution} />
            <CategoryBars data={data.categoryDistribution} total={data.stats.totalRecords} />
            <WeeklyActivity data={data.weeklyActivity} />
          </div>
          {data.topSearches.length > 0 && (
            <div className={card}>
              <p className={cn(cardTitle, "mb-3")}>Top searches, last 30 days</p>
              <div className="flex flex-wrap gap-2">
                {data.topSearches.map((t) => (
                  <Link
                    key={t.query}
                    to={`/search?q=${encodeURIComponent(t.query)}`}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-sunken px-4 text-[13.5px] font-semibold text-ink-2 hover:bg-ink hover:text-white"
                  >
                    {t.query} <span className="text-xs opacity-60 tabular">{t.n}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

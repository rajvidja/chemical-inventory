import { ArrowUpRight, Bell, CalendarX, ChevronRight, CircleCheck, ClipboardList, Hourglass, MapPin, PackageX, Plus, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ChemicalListItem, DashboardResponse, ExpiryItem, ReorderItem } from "@shared/types";
import { recordAccess, useDashboard, useMeta, useSearchHistory } from "@/lib/api";
import { usePickNavigation } from "@/lib/navigation";
import { cn, daysUntil, expiryText, formatDate, formatPct } from "@/lib/utils";
import { Logo } from "@/components/layout/AppShell";
import { SearchBar } from "@/components/search/SearchBar";
import { Skeleton } from "@/components/ui/primitives";
import { CategoryIcon, categoryTint, LocationBadge, OrderedBadge, PriorityBadge, STATUS_STYLE } from "@/components/chem/bits";
import { useChemActions } from "@/components/chem/ChemActions";
import { QuickActions } from "@/components/home/QuickActions";

function SectionHead({ title, to, label = "See all" }: { title: React.ReactNode; to?: string; label?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {to && (
        <Link to={to} className="text-[14px] font-bold text-ink-2 hover:text-ink hover:underline">
          {label}
        </Link>
      )}
    </div>
  );
}

const card = "rounded-[28px] bg-surface shadow-[var(--shadow-1)]";
const overline = "text-[11px] font-bold uppercase tracking-[0.08em]";

/* ---------- Needs attention ---------- */

function DeltaChip({ trend }: { trend: DashboardResponse["trend"] }) {
  const base = "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold tabular [&_svg]:size-3.5";
  const d = trend.attentionDelta;
  if (d === null || !trend.since) return <span className={cn(base, "bg-sunken text-muted")}>Collecting data</span>;
  const when = daysUntil(trend.since) === -1 ? "today" : `since ${formatDate(trend.since, false)}`;
  if (d === 0) return <span className={cn(base, "bg-sunken text-ink-2")}>No change {when}</span>;
  return d > 0 ? (
    <span className={cn(base, "bg-out-soft text-out-text")}>
      <TrendingUp /> +{d} {when}
    </span>
  ) : (
    <span className={cn(base, "bg-good-soft text-good-text")}>
      <TrendingDown /> {d} {when}
    </span>
  );
}

function AttentionRow({ to, icon, tone, count, label, extra }: { to: string; icon: React.ReactNode; tone: string; count: number; label: string; extra?: React.ReactNode }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 rounded-[20px] bg-surface-muted px-3 py-2.5 transition hover:bg-sunken">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-[18px]", tone)}>{icon}</span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight text-ink">
        {label}
        {extra}
      </span>
      <span className="text-[18px] font-extrabold tabular text-ink">{count}</span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Link>
  );
}

function NeedsAttention({ a, trend }: { a: DashboardResponse["attention"]; trend: DashboardResponse["trend"] }) {
  const urgent = a.out + a.low + a.needsReview;
  const critical = a.critical > 0 && <span className="ml-1.5 font-bold text-out-text">· {a.critical} critical</span>;
  return (
    <section className={cn(card, "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn(overline, "text-muted")}>Needs attention</p>
          <p className="mt-2 text-[56px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular">{urgent}</p>
          <p className="mt-1.5 text-lg font-semibold text-ink-2">{urgent === 1 ? "item needs" : "items need"} attention</p>
          <div className="mt-3">
            <DeltaChip trend={trend} />
          </div>
        </div>
        <Link to="/alerts" aria-label="Open stock alerts" className="grid size-14 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-ink-soft active:scale-95">
          <ArrowUpRight className="size-6" />
        </Link>
      </div>
      <div className="mt-5 space-y-2">
        {a.out > 0 && <AttentionRow to="/alerts?status=out" icon={<PackageX />} tone="bg-out-soft text-out-text" count={a.out} label="Out of stock" extra={critical} />}
        {a.low > 0 && <AttentionRow to="/alerts?status=low" icon={<TrendingDown />} tone="bg-low-soft text-low-text" count={a.low} label="Running low" extra={a.out ? null : critical} />}
        {a.needsReview > 0 && <AttentionRow to="/review" icon={<ClipboardList />} tone="bg-review-50 text-review" count={a.needsReview} label="Rows need pairing" />}
        {a.ordered > 0 && <AttentionRow to="/alerts?status=ordered" icon={<Truck />} tone="bg-ordered-soft text-ordered-text" count={a.ordered} label="On order" />}
        {urgent === 0 && (
          <p className="flex items-center gap-2 rounded-[20px] bg-good-soft px-4 py-4 text-sm font-semibold text-good-text">
            <CircleCheck className="size-5" /> All clear. Nothing is low, empty or waiting for review.
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- Categories ---------- */

function CategoryBento() {
  const { data: meta } = useMeta();
  if (!meta) return <Skeleton className="h-80 rounded-[28px]" />;
  const cats = meta.categories.filter((c) => c.chemicalCount > 0).sort((x, y) => y.chemicalCount - x.chemicalCount);
  if (!cats.length) return null;
  const [big, ...rest] = cats;
  const small = rest.slice(0, 7);
  const bigTint = categoryTint(big.name, big.color);
  const arrow = (size: string) => (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-ink text-white", size)}>
      <ArrowUpRight className="size-5" />
    </span>
  );
  return (
    <section>
      <SectionHead title="Categories" to="/categories" label={`See all ${meta.categories.length}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link
          to={`/categories/${big.slug}`}
          className="col-span-2 flex min-h-[260px] md:row-span-2 flex-col rounded-[28px] p-5 transition hover:brightness-[0.98] active:scale-[0.99]"
          style={{ backgroundColor: bigTint.soft }}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-surface text-ink">
              <CategoryIcon icon={big.icon} className="size-6" />
            </span>
            <span className="rounded-full bg-ink/[0.07] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">Largest</span>
          </span>
          <span className="mt-auto pt-6">
            <span className="block text-[56px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular">{big.chemicalCount}</span>
            <span className="mt-1 flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">{big.name}</span>
                {big.children.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {[...big.children]
                      .sort((x, y) => y.chemicalCount - x.chemicalCount)
                      .slice(0, 3)
                      .map((c) => (
                        <span key={c.slug} className="rounded-full bg-surface/70 px-2.5 py-1 text-xs font-semibold text-ink-2">
                          {c.name} · {c.chemicalCount}
                        </span>
                      ))}
                  </span>
                )}
              </span>
              {arrow("size-12")}
            </span>
          </span>
        </Link>
        {small.map((c, i) => {
          const t = categoryTint(c.name, c.color);
          return (
            <Link
              key={c.slug}
              to={`/categories/${c.slug}`}
              className={cn("flex min-h-[124px] flex-col rounded-[28px] p-4 transition hover:brightness-[0.98] active:scale-[0.98]", i >= 5 && "max-md:hidden")}
              style={{ backgroundColor: t.soft }}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-full bg-surface text-ink">
                  <CategoryIcon icon={c.icon} className="size-[18px]" />
                </span>
                <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-ink tabular">{c.chemicalCount}</span>
              </span>
              <span className="mt-auto line-clamp-2 pt-3 text-[14px] font-bold leading-tight text-ink">{c.name}</span>
            </Link>
          );
        })}
        <Link
          to="/categories"
          className="flex min-h-[124px] flex-col justify-between rounded-[28px] bg-ink p-4 text-white transition hover:bg-ink-soft active:scale-[0.98]"
        >
          <span className="grid size-10 place-items-center rounded-full bg-white/10">
            <ArrowUpRight className="size-5" />
          </span>
          <span>
            <span className="block text-[14px] font-bold leading-tight">All categories</span>
            <span className="text-xs font-medium text-white/60">Browse and combine</span>
          </span>
        </Link>
      </div>
    </section>
  );
}

/* ---------- Expiring soon ---------- */

function ExpiringSoon({ items, total }: { items: ExpiryItem[]; total: number }) {
  const navigate = useNavigate();
  return (
    <section className="dotted rounded-[28px] bg-cream p-5 text-cream-text">
      <div className="mb-3 flex items-center justify-between">
        <p className={overline}>Expiring soon</p>
        <span className="rounded-full bg-surface/70 px-2.5 py-1 text-xs font-bold tabular">{total}</span>
      </div>
      <div className="space-y-2">
        {items.map((e) => (
          <button
            key={e.containerId}
            onClick={() => {
              recordAccess(e.chemicalId, "dashboard");
              navigate(`/chemicals/${e.chemicalId}`);
            }}
            className="flex w-full items-center gap-3 rounded-[20px] bg-surface/80 px-3 py-2.5 text-left transition hover:bg-surface"
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", e.daysLeft < 0 ? "bg-expired-soft text-expired-text" : "bg-expiring-soft text-expiring-text")}>
              {e.daysLeft < 0 ? <CalendarX className="size-[18px]" /> : <Hourglass className="size-[18px]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">{e.name}</span>
              <span className="block truncate text-xs font-medium text-muted">{[e.brand, e.location].filter(Boolean).join(" · ") || "—"}</span>
            </span>
            <span className={cn("shrink-0 text-xs font-bold", e.daysLeft < 0 ? "text-expired-text" : "text-expiring-text")}>{expiryText(e.daysLeft)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Continue where you left off ---------- */

function RecentChip({ c, onOpen }: { c: ChemicalListItem; onOpen: () => void }) {
  const loc = c.containers.find((x) => x.location)?.location;
  const cat = c.categories[0];
  const tint = cat ? categoryTint(cat.name, cat.color) : { solid: "#9A9EA6", soft: "#EDEDEF" };
  return (
    <button onClick={onOpen} className={cn(card, "flex w-full flex-col rounded-[20px] p-4 text-left transition hover:shadow-[var(--shadow-2)] active:scale-[0.98]")}>
      <span className="grid size-12 place-items-center rounded-full text-ink-2" style={{ backgroundColor: tint.soft }}>
        <CategoryIcon icon={cat?.icon ?? "package"} className="size-5" />
      </span>
      <span className="mt-3 line-clamp-2 min-h-10 text-[14px] font-bold leading-5 text-ink">{c.name}</span>
      <span className="mt-2 flex items-center gap-2">
        <span className={cn("text-lg font-extrabold tabular", STATUS_STYLE[c.status].text)}>{formatPct(c.bestPct)}</span>
        {loc && <LocationBadge name={loc} />}
      </span>
    </button>
  );
}

/* ---------- Reorder list ---------- */

function ReorderList({ items }: { items: ReorderItem[] }) {
  const actions = useChemActions();
  const navigate = useNavigate();
  return (
    <section>
      <SectionHead title="Reorder" to="/alerts" />
      <div className={cn(card, "space-y-2 p-3")}>
        {items.map((r) => (
          <div key={r.chemicalId} className={cn("flex items-center gap-3 rounded-[20px] px-3 py-3", r.order ? "bg-ordered-soft" : "bg-surface-muted")}>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                recordAccess(r.chemicalId, "dashboard");
                navigate(`/chemicals/${r.chemicalId}`);
              }}
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-bold text-ink">{r.name}</span>
                {r.priority && <PriorityBadge priority={r.priority} className="max-sm:px-1.5" />}
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs">
                <span className={cn("font-bold tabular", STATUS_STYLE[r.status].text)}>{formatPct(r.bestPct)} left</span>
                {r.location && <LocationBadge name={r.location} />}
              </span>
            </button>
            {r.order ? (
              <OrderedBadge label={`Ordered ${formatDate(r.order.orderedOn, false)}`} className="bg-surface" />
            ) : (
              <button
                onClick={() => actions.markOrdered({ id: r.chemicalId, name: r.name })}
                className="h-9 shrink-0 rounded-full bg-sky-soft px-3.5 text-[12px] font-bold text-sky-text transition hover:bg-sky/30 active:scale-95"
              >
                Mark as ordered
              </button>
            )}
          </div>
        ))}
        {!items.length && <p className="px-4 py-5 text-center text-sm font-medium text-muted">Nothing needs reordering.</p>}
      </div>
    </section>
  );
}

/* ---------- Shelf shortcuts ---------- */

function ShelfShortcuts() {
  const { data: meta } = useMeta();
  if (!meta) return <Skeleton className="h-24 rounded-[28px]" />;
  const top = meta.locations
    .filter((l) => l.containerCount > 0)
    .sort((a, b) => b.containerCount - a.containerCount)
    .slice(0, 8);
  return (
    <section>
      <SectionHead title="Shelves" to="/locations" label={`See all ${meta.locations.length}`} />
      <div className="flex flex-wrap gap-2">
        {top.map((l) => (
          <Link
            key={l.id}
            to={`/locations/${l.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-surface pl-3.5 pr-4 shadow-[var(--shadow-1)] transition hover:bg-ink hover:text-white active:scale-95 [&:hover_*]:text-white"
          >
            <MapPin className="size-3.5 text-muted" />
            <span className="font-mono text-[14px] font-bold text-ink">{l.name}</span>
            <span className="text-xs font-semibold text-muted tabular">{l.chemicalCount}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data, isLoading } = useDashboard();
  const history = useSearchHistory();
  const navigate = useNavigate();
  const onPick = usePickNavigation();
  const [q, setQ] = useState("");
  const s = data?.stats;
  const a = data?.attention;

  const chips = [...new Set([...(history.data?.recent ?? []).map((r) => r.query), ...(history.data?.popular ?? []).map((p) => p.query)])].slice(0, 4);
  const open = (id: number) => {
    recordAccess(id, "dashboard");
    navigate(`/chemicals/${id}`);
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-5 flex items-center justify-between md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/alerts" aria-label="Stock alerts" className="relative grid size-11 place-items-center rounded-full bg-surface text-ink shadow-[var(--shadow-1)]">
            <Bell className="size-5" />
            {!!a && a.out + a.low > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-ember ring-2 ring-surface" />}
          </Link>
          <Link to="/chemicals/new" aria-label="Add chemical" className="grid size-11 place-items-center rounded-full bg-ink text-white">
            <Plus className="size-5" />
          </Link>
        </div>
      </header>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-7">
          {/* 1. Search */}
          <section>
            <SearchBar value={q} onChange={setQ} onPick={onPick} size="lg" />
            {chips.length > 0 && (
              <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 scrollbar-none md:mx-0 md:flex-wrap md:px-0">
                {chips.map((term) => (
                  <Link
                    key={term}
                    to={`/search?q=${encodeURIComponent(term)}`}
                    className="inline-flex h-10 shrink-0 items-center rounded-full bg-sunken px-4 text-[13.5px] font-semibold text-ink-2 transition hover:bg-ink hover:text-white"
                  >
                    {term}
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-3 px-1 text-[12.5px] font-medium text-muted">
              {s ? `${s.totalRecords} records · ${s.totalContainers} containers · ${s.locations} locations` : "Loading inventory…"}
            </p>
          </section>

          {/* 2. Categories */}
          <CategoryBento />

          {/* 3. Needs attention */}
          {data ? <NeedsAttention a={data.attention} trend={data.trend} /> : <Skeleton className="h-72 rounded-[28px]" />}

          {/* 4. Quick actions */}
          <QuickActions reorderCount={a ? a.low + a.out : undefined} />

          {/* 4. Expiring soon (only once expiry dates exist) */}
          {data && data.expiring.length > 0 && <ExpiringSoon items={data.expiring} total={data.attention.expired + data.attention.expiringSoon} />}

          {/* 5. Continue where you left off */}
          <section>
            <SectionHead title="Continue where you left off" />
            {isLoading ? (
              <Skeleton className="h-40 rounded-[20px]" />
            ) : data?.recent.length ? (
              <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 scrollbar-none md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 2xl:grid-cols-5">
                {data.recent.map((c) => (
                  <div key={c.id} className="w-[170px] shrink-0 snap-start md:w-auto">
                    <RecentChip c={c} onOpen={() => open(c.id)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className={cn(card, "px-4 py-6 text-center text-sm font-medium text-muted")}>Chemicals you open will show up here.</p>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-7 self-start">
          {/* 6. Reorder list */}
          {data ? <ReorderList items={data.reorder} /> : <Skeleton className="h-64 rounded-[28px]" />}

          {/* 7. Shelf shortcuts */}
          <ShelfShortcuts />
        </aside>
      </div>
    </div>
  );
}

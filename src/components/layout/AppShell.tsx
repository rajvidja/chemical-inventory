import {
  BarChart3,
  Bell,
  Boxes,
  FileSpreadsheet,
  FlaskConical,
  FolderTree,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useDashboard, useMeta } from "@/lib/api";
import { useMediaQuery, useOnline } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="ChemStock home">
      <span className="grid size-10 place-items-center rounded-full bg-lime text-ink">
        <FlaskConical className="size-5" strokeWidth={2.4} />
      </span>
      {!compact && <span className="text-lg font-extrabold tracking-[-0.02em] text-ink">ChemStock</span>}
    </Link>
  );
}

function useAlertCount() {
  const { data } = useDashboard();
  return data ? data.attention.low + data.attention.out : 0;
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/locations", label: "Storage locations", icon: MapPin },
  { to: "/alerts", label: "Stock alerts", icon: Bell, badge: "alerts" as const },
  { to: "/insights", label: "Insights", icon: BarChart3 },
];
const NAV_SECONDARY = [
  { to: "/review", label: "Data review", icon: ListChecks, badge: "review" as const },
  { to: "/import", label: "Import & export", icon: FileSpreadsheet },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Sidebar({ collapsed, canExpand, onToggle }: { collapsed: boolean; canExpand: boolean; onToggle: () => void }) {
  const alertCount = useAlertCount();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const badge = (b?: "alerts" | "review") => (b === "alerts" ? alertCount : b === "review" ? (meta?.reviewCount ?? 0) : 0);

  const item = (n: (typeof NAV)[number] | (typeof NAV_SECONDARY)[number]) => {
    const count = badge("badge" in n ? n.badge : undefined);
    return (
      <NavLink
        key={n.to}
        to={n.to}
        end={"end" in n ? n.end : undefined}
        title={collapsed ? n.label : undefined}
        className={({ isActive }) =>
          cn(
            "group relative flex h-12 items-center gap-3 rounded-full px-4 text-[14px] font-semibold transition-colors",
            isActive ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-muted hover:text-ink",
            collapsed && "justify-center px-0",
          )
        }
      >
        <n.icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
        {count > 0 &&
          (collapsed ? (
            <span className="absolute right-3 top-3 size-2 rounded-full bg-ember" />
          ) : (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular", n.to === "/alerts" ? "bg-low-soft text-low-text" : "bg-review-50 text-review")}>
              {count}
            </span>
          ))}
      </NavLink>
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-3 left-3 z-30 hidden flex-col rounded-[28px] bg-surface shadow-[var(--shadow-1)] transition-[width] duration-200 md:flex",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      <div className={cn("flex h-20 items-center", collapsed ? "justify-center" : "justify-between px-5")}>
        <Logo compact={collapsed} />
        {!collapsed && (
          <button onClick={onToggle} className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      <div className={cn("px-3 pb-3", collapsed && "px-3")}>
        <button
          onClick={() => navigate("/search")}
          title="Search (press /)"
          className={cn(
            "flex h-12 w-full items-center gap-2.5 rounded-full bg-sunken text-left text-sm font-medium text-muted transition hover:text-ink",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          <Search className="size-4 shrink-0 text-ink" />
          {!collapsed && (
            <>
              <span className="flex-1">Search chemicals…</span>
              <kbd className="grid size-6 place-items-center rounded-full bg-surface font-mono text-[11px] font-bold text-ink-2">/</kbd>
            </>
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map(item)}
        <div className="my-3 h-px bg-line" />
        {NAV_SECONDARY.map(item)}
      </nav>
      <div className="space-y-2 p-3">
        <Link
          to="/chemicals/new"
          title="Add chemical"
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-sm font-bold text-white transition hover:bg-ink-soft",
          )}
        >
          <Plus className="size-4" />
          {!collapsed && "Add chemical"}
        </Link>
        {collapsed && canExpand && (
          <button onClick={onToggle} className="grid h-10 w-full place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label="Expand sidebar">
            <PanelLeftOpen className="size-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/search", label: "Search", icon: Search, primary: true },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/more", label: "More", icon: Menu },
];

function BottomNav() {
  const alertCount = useAlertCount();
  const loc = useLocation();
  const moreActive = ["/more", "/locations", "/alerts", "/settings", "/import", "/review", "/insights"].some((p) => loc.pathname.startsWith(p));
  return (
    <nav className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:hidden" aria-label="Main">
      <div className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center rounded-full bg-ink px-2 shadow-[var(--shadow-3)]">
        {MOBILE_NAV.map((n) =>
          n.primary ? (
            <NavLink key={n.to} to={n.to} className="flex items-center justify-center" aria-label="Search">
              <span className="-mt-9 grid size-[72px] place-items-center rounded-full bg-lavender text-ink shadow-[var(--shadow-3)] ring-[6px] ring-canvas transition-transform active:scale-95">
                <Search className="size-7" strokeWidth={2.4} />
              </span>
            </NavLink>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              aria-label={n.label}
              title={n.label}
              className={({ isActive }) =>
                cn("relative flex h-full flex-col items-center justify-center gap-1.5 transition-colors", (n.to === "/more" ? moreActive : isActive) ? "text-white" : "text-[#8B8F98]")
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className="size-6" strokeWidth={2} />
                  <span className={cn("size-1 rounded-full", (n.to === "/more" ? moreActive : isActive) ? "bg-white" : "bg-transparent")} />
                  {n.to === "/more" && alertCount > 0 && <span className="absolute right-[calc(50%-15px)] top-4 size-2.5 rounded-full bg-ember ring-2 ring-ink" />}
                </>
              )}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [userCollapsed, setCollapsed] = useState(() => localStorage.getItem("chemstock.sidebar") === "collapsed");
  const wide = useMediaQuery("(min-width: 1024px)");
  const collapsed = userCollapsed || !wide;
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("chemstock.sidebar", userCollapsed ? "collapsed" : "open");
  }, [userCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        if (location.pathname !== "/search") navigate("/search");
        else document.querySelector<HTMLInputElement>('input[aria-label="Search chemicals"]')?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, location.pathname]);

  return (
    <div className="min-h-dvh">
      <Sidebar collapsed={collapsed} canExpand={wide} onToggle={() => setCollapsed((c) => !c)} />
      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-[88px]" : "md:pl-[276px]")}>
        {!online && (
          <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-cream px-4 py-2 text-xs font-bold text-cream-text">
            <WifiOff className="size-3.5" /> Offline – showing the last synced inventory. Changes need a connection.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] px-5 pb-36 pt-4 md:px-6 md:pb-10 md:pt-6 lg:px-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5 md:mb-6">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink md:text-[40px] md:leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

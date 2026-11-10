import {
  Atom,
  CircleCheck,
  CircleHelp,
  CircleX,
  Contrast,
  Droplets,
  Eye,
  Flame,
  FlaskConical,
  GitMerge,
  Hexagon,
  Layers,
  Link2,
  MapPin,
  Microscope,
  Package,
  ShieldCheck,
  TestTube,
  TestTubes,
  TriangleAlert,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABEL, type StockStatus } from "@shared/stock";
import { compactName } from "@shared/normalize";
import type { AlertPriority } from "@shared/types";
import { cn, formatPct } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  "test-tube": TestTube,
  "test-tubes": TestTubes,
  "flask-conical": FlaskConical,
  zap: Zap,
  "link-2": Link2,
  "shield-check": ShieldCheck,
  atom: Atom,
  layers: Layers,
  hexagon: Hexagon,
  microscope: Microscope,
  package: Package,
  "circle-help": CircleHelp,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Package;
  return <Icon className={className} />;
}

export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export const STATUS_STYLE: Record<StockStatus, { text: string; bg: string; bar: string; dot: string; hex: string }> = {
  good: { text: "text-good-text", bg: "bg-good-soft", bar: "bg-good", dot: "bg-good", hex: "#5CC46B" },
  moderate: { text: "text-moderate-text", bg: "bg-moderate-soft", bar: "bg-moderate", dot: "bg-moderate", hex: "#F5B83D" },
  low: { text: "text-low-text", bg: "bg-low-soft", bar: "bg-low", dot: "bg-low", hex: "#F2813C" },
  out: { text: "text-out-text", bg: "bg-out-soft", bar: "bg-out", dot: "bg-out", hex: "#E5484D" },
  unknown: { text: "text-unknown-text", bg: "bg-unknown-soft", bar: "bg-unknown", dot: "bg-unknown", hex: "#9A9EA6" },
  review: { text: "text-review", bg: "bg-review-50", bar: "bg-review-solid", dot: "bg-review-solid", hex: "#8B89F0" },
};

export const STATUS_ICON: Record<StockStatus, LucideIcon> = {
  good: CircleCheck,
  moderate: Contrast,
  low: TriangleAlert,
  out: CircleX,
  unknown: CircleHelp,
  review: GitMerge,
};

export function StatusBadge({ status, className, compact }: { status: StockStatus; className?: string; compact?: boolean }) {
  const s = STATUS_STYLE[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold", s.bg, s.text, className)}>
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      {compact ? STATUS_LABEL[status].replace(" stock", "") : STATUS_LABEL[status]}
    </span>
  );
}

const badge = "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold [&_svg]:size-3.5";

export function PriorityBadge({ priority, className }: { priority: AlertPriority; className?: string }) {
  return priority === "critical" ? (
    <span className={cn(badge, "bg-out-soft text-out-text", className)}>
      <Flame /> Critical
    </span>
  ) : (
    <span className={cn(badge, "bg-review-50 text-review", className)}>
      <Eye /> Watchlist
    </span>
  );
}

export function OrderedBadge({ className, label = "On order" }: { className?: string; label?: string }) {
  return (
    <span className={cn(badge, "bg-ordered-soft text-ordered-text", className)}>
      <Truck /> {label}
    </span>
  );
}

export function StockBar({
  pct,
  status,
  className,
  showLabel = true,
  size = "sm",
}: {
  pct: number | null;
  status: StockStatus;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const s = STATUS_STYLE[status];
  const h = size === "lg" ? "h-3" : size === "md" ? "h-2" : "h-1.5";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative w-full min-w-10 overflow-hidden rounded-full bg-sunken", h)} role="meter" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", s.bar)}
          style={{ width: `${Math.max(pct ?? 0, pct ? 3 : 0)}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("w-10 shrink-0 text-right text-xs font-bold tabular", pct === null ? "text-muted" : s.text)}>
          {formatPct(pct)}
        </span>
      )}
    </div>
  );
}

/** Circular fill gauge for a single container. */
export function ProgressRing({ pct, status, size = 56, className }: { pct: number | null; status: StockStatus; size?: number; className?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role="meter" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={`${formatPct(pct)} remaining`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDEDEF" strokeWidth={6} />
        {pct !== null && v > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS_STYLE[status].hex} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-500" />
        )}
      </svg>
      <span className="absolute text-[13px] font-extrabold tabular text-ink">{pct === null ? "?" : Math.round(v)}</span>
    </div>
  );
}

export function LocationBadge({ name, className, muted }: { name: string; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 font-mono text-[11.5px] font-semibold",
        muted ? "bg-surface-muted text-muted" : "bg-sunken text-ink-2",
        className,
      )}
    >
      <MapPin className="size-3 opacity-70" />
      {name}
    </span>
  );
}

const CATEGORY_TINTS: [RegExp, { solid: string; soft: string }][] = [
  [/solvent/i, { solid: "#6C9CF0", soft: "#E1EAFE" }],
  [/^(acids?|bases?)\b/i, { solid: "#F0836A", soft: "#FDE6DF" }],
  [/^coupling/i, { solid: "#E8B85A", soft: "#FBF0D4" }],
  [/catalyst/i, { solid: "#9D9CF5", soft: "#E3E2FC" }],
  [/^(organic )?reagents?\b/i, { solid: "#5CC4A0", soft: "#DDF5EC" }],
];

const FALLBACK_TINTS = [
  { solid: "#9D9CF5", soft: "#E3E2FC" },
  { solid: "#8FD17E", soft: "#E3F6DD" },
  { solid: "#6C9CF0", soft: "#E1EAFE" },
  { solid: "#D9CB6A", soft: "#F3F2D9" },
  { solid: "#5CC4A0", soft: "#DDF5EC" },
  { solid: "#F0836A", soft: "#FDE6DF" },
  { solid: "#E8B85A", soft: "#FBF0D4" },
];

/** Display tint for a category: the design-system pastel where one is defined, otherwise a stable pastel picked from the name. */
export function categoryTint(name: string, _color: string) {
  const named = CATEGORY_TINTS.find(([re]) => re.test(name))?.[1];
  if (named) return named;
  if (/^unclassified/i.test(name)) return { solid: "#9A9EA6", soft: "#EDEDEF" };
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TINTS[h % FALLBACK_TINTS.length];
}

export function CategoryBadge({ name, color, icon, className }: { name: string; color: string; icon?: string; className?: string }) {
  const t = categoryTint(name, color);
  return (
    <span
      className={cn("inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full px-2.5 text-xs font-semibold text-ink-2", className)}
      style={{ backgroundColor: t.soft }}
    >
      {icon ? <CategoryIcon icon={icon} className="size-3 shrink-0" /> : <span className="size-1.5 shrink-0 rounded-full" style={{ background: t.solid }} />}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

export function Cas({ cas, valid = true, className }: { cas: string | null; valid?: boolean; className?: string }) {
  if (!cas) return <span className={cn("text-xs text-muted", className)}>No CAS</span>;
  return (
    <span className={cn("font-mono text-[12px] font-medium tabular text-ink-2", !valid && "text-warning-700", className)} title={valid ? undefined : "CAS check digit does not validate – possible typo in source data"}>
      {cas}
      {!valid && " ⚠"}
    </span>
  );
}

/**
 * Highlights the part of `text` that matches `query`, ignoring case and separators
 * (so "2 chlorobenz" highlights inside "2-Chlorobenzaldehyde").
 */
export function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  const ranges = matchRanges(text, query);
  if (!ranges.length) return <span className={className}>{text}</span>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([s, e], i) => {
    if (s > last) parts.push(text.slice(last, s));
    parts.push(
      <mark key={i} className="rounded-[4px] bg-lavender/35 px-px text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    last = e;
  });
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

function matchRanges(text: string, query: string): [number, number][] {
  const map: number[] = [];
  let compact = "";
  for (let i = 0; i < text.length; i++) {
    const ch = compactName(text[i]);
    if (ch) {
      compact += ch;
      for (let k = 0; k < ch.length; k++) map.push(i);
    }
  }
  const find = (needle: string): [number, number] | null => {
    if (!needle) return null;
    const idx = compact.indexOf(needle);
    if (idx < 0) return null;
    return [map[idx], map[idx + needle.length - 1] + 1];
  };
  const whole = find(compactName(query));
  if (whole) return [whole];
  const ranges = query
    .split(/[\s,]+/)
    .map((t) => compactName(t))
    .filter((t) => t.length >= 2)
    .map(find)
    .filter((r): r is [number, number] => !!r)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

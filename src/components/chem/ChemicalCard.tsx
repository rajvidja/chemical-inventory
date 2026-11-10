import { Copy, ExternalLink, MapPinned, MoreHorizontal, PackagePlus, Percent, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { ChemicalListItem, MatchField } from "@shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/primitives";
import { Cas, CategoryBadge, CategoryIcon, categoryTint, Highlight, LocationBadge, StatusBadge, StockBar } from "./bits";
import { useChemActions } from "./ChemActions";

const MATCH_LABEL: Partial<Record<MatchField, string>> = {
  synonym: "Also known as",
  brand: "Brand",
  location: "Location",
  category: "Category",
  tag: "Tag",
  class: "Class",
};

export function ChemicalMenu({ chemical, onOpen }: { chemical: ChemicalListItem; onOpen?: () => void }) {
  const actions = useChemActions();
  const editable = chemical.containers.some((c) => !c.needsReview);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${chemical.name}`} onClick={(e) => e.stopPropagation()} className="-mr-1.5 text-muted">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {onOpen && (
          <DropdownMenuItem onSelect={onOpen}>
            <ExternalLink /> Open details
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!editable} onSelect={() => actions.updateAvailability(chemical)}>
          <Percent /> Update availability
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!editable} onSelect={() => actions.changeLocation(chemical)}>
          <MapPinned /> Change location
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.addContainer(chemical)}>
          <PackagePlus /> Add stock container
        </DropdownMenuItem>
        {chemical.cas && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard?.writeText(chemical.cas!);
                toast.success(`Copied ${chemical.cas}`);
              }}
            >
              <Copy /> Copy CAS number
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChemicalAvatar({ name, color, icon }: { name: string; color: string; icon: string }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full text-ink-2" style={{ backgroundColor: categoryTint(name, color).soft }} title={name}>
      <CategoryIcon icon={icon} className="size-5" />
    </span>
  );
}

export function ChemicalCard({
  chemical,
  query = "",
  onOpen,
  selected,
  locationFocus,
}: {
  chemical: ChemicalListItem;
  query?: string;
  onOpen: () => void;
  selected?: boolean;
  locationFocus?: string;
}) {
  const primary = chemical.categories.find((c) => c.isPrimary) ?? chemical.categories[0];
  const containers = chemical.containers;
  const shown = locationFocus
    ? [...containers].sort((a, b) => Number(b.location === locationFocus) - Number(a.location === locationFocus))
    : containers;
  const visible = shown.slice(0, 3);
  const hidden = containers.length - visible.length;
  const showMatch = query && chemical.match && MATCH_LABEL[chemical.match.field] && chemical.match.field !== "location";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={cn(
        "group min-w-0 cursor-pointer rounded-[20px] border-2 bg-surface p-4 shadow-[var(--shadow-1)] transition-[border-color,box-shadow] duration-150 hover:shadow-[var(--shadow-2)] active:bg-surface-muted/60 animate-slide-up",
        selected ? "border-lavender bg-lavender-soft/40" : "border-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {primary && <ChemicalAvatar name={primary.name} color={primary.color} icon={primary.icon} />}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold leading-snug tracking-[-0.01em] text-ink">
            <Highlight text={chemical.name} query={query} />
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {chemical.cas ? (
              <span className="font-mono text-[12px] tabular text-ink-2">
                CAS{" "}
                {chemical.match?.field === "cas" ? <Highlight text={chemical.cas} query={query} /> : <Cas cas={chemical.cas} valid={chemical.casValid} />}
              </span>
            ) : (
              <span className="text-xs text-muted">No CAS recorded</span>
            )}
            {chemical.formula && <span className="text-xs text-muted">· {chemical.formula}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={chemical.status} compact />
          <ChemicalMenu chemical={chemical} onOpen={onOpen} />
        </div>
      </div>

      {showMatch && (
        <p className="mt-1.5 truncate text-xs text-muted">
          {MATCH_LABEL[chemical.match!.field]}: <Highlight text={chemical.match!.text} query={query} className="text-ink-2" />
        </p>
      )}

      <div className="mt-3 space-y-2">
        {visible.map((c) =>
          c.needsReview ? (
            <div key={c.id} className="rounded-[14px] bg-review-50/70 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-review">
                <TriangleAlert className="size-3.5" /> Containers need review · values from source row
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.mentionedLocations.map((l) => (
                  <LocationBadge key={l} name={l} className={cn(locationFocus === l && "ring-1 ring-ink")} />
                ))}
              </div>
              <p className="mt-1 truncate text-[11.5px] text-muted">
                {c.raw?.brand ?? "No brand"} · {c.raw?.availability ?? "no %"}
              </p>
            </div>
          ) : (
            <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="truncate font-semibold text-ink">
                  {query && chemical.match?.field === "brand" && c.brand ? <Highlight text={c.brand} query={query} /> : (c.brand ?? "Unknown brand")}
                </span>
                <span className="shrink-0 text-muted">· {c.packSize ?? "—"}</span>
              </div>
              {c.location ? (
                <LocationBadge name={c.location} className={cn(locationFocus && locationFocus.toLowerCase() === c.location.toLowerCase() && "bg-ink text-white")} />
              ) : (
                <span className="text-xs text-muted">No location</span>
              )}
              <StockBar pct={c.remainingPercentage} status={c.status} className="col-span-2" />
            </div>
          ),
        )}
        {hidden > 0 && <p className="text-xs font-bold text-ink-2">+{hidden} more container{hidden > 1 ? "s" : ""}</p>}
        {containers.length === 0 && <p className="text-xs text-muted">No stock containers recorded</p>}
      </div>

      {primary && (
        <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
          <CategoryBadge name={primary.name} color={primary.color} icon={primary.icon} />
          {chemical.categories.length > 1 && <span className="text-[11.5px] text-muted">+{chemical.categories.length - 1}</span>}
        </div>
      )}
    </article>
  );
}

export function ChemicalCardSkeleton() {
  return (
    <div className="rounded-[20px] bg-surface p-4 shadow-[var(--shadow-1)]">
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-1.5 w-full" />
      </div>
      <Skeleton className="mt-4 h-5 w-32 rounded-full" />
    </div>
  );
}

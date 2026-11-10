import { MapPin, Pencil, Search, SearchX, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { compactName, normalizeText } from "@shared/normalize";
import { recordAccess, useLocation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ChemicalCard, ChemicalCardSkeleton } from "@/components/chem/ChemicalCard";
import { BackButton } from "./ChemicalPage";
import { LocationDialog } from "./LocationsPage";

export default function LocationDetailPage() {
  const id = Number(useParams().id);
  const { data, isLoading, isError } = useLocation(id);
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState(false);

  const stats = useMemo(() => {
    const here = data?.items.flatMap((c) => c.containers.filter((k) => k.location === data.name)) ?? [];
    return {
      containers: here.length,
      low: here.filter((k) => k.status === "low").length,
      out: here.filter((k) => k.status === "out").length,
      review: data?.items.filter((c) => c.containers.some((k) => k.needsReview && k.mentionedLocations.includes(data.name))).length ?? 0,
    };
  }, [data]);

  const items = useMemo(() => {
    const t = normalizeText(term);
    const tc = compactName(term);
    if (!t) return data?.items ?? [];
    return (data?.items ?? []).filter(
      (c) => normalizeText(c.name).includes(t) || (tc && compactName(c.name).includes(tc)) || (c.cas ?? "").replace(/-/g, "").includes(t.replace(/-/g, "")),
    );
  }, [data, term]);

  if (isError) return <EmptyState icon={<SearchX />} title="Location not found" action={<Button onClick={() => navigate("/locations")}>All locations</Button>} />;

  return (
    <div className="animate-fade-in">
      <BackButton label="Locations" fallback="/locations" />
      <div className="mb-5 flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-navy-50 text-navy">
          <MapPin className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-[24px] font-semibold tracking-tight text-navy md:text-[28px]">{data?.name ?? "…"}</h1>
          <p className="text-sm text-muted">{data?.description ?? "Storage location"}</p>
        </div>
        {data && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> <span className="max-sm:hidden">Edit</span>
          </Button>
        )}
      </div>

      {data && (
        <div className="mb-5 grid grid-cols-3 gap-2 md:max-w-xl">
          <Card className="p-3">
            <p className="text-xl font-semibold text-ink tabular">{data.items.length}</p>
            <p className="text-xs text-muted">chemicals</p>
          </Card>
          <Card className="p-3">
            <p className="text-xl font-semibold text-ink tabular">{stats.containers}</p>
            <p className="text-xs text-muted">containers here</p>
          </Card>
          <Card className="p-3">
            <p className="text-xl font-semibold text-warning-700 tabular">{stats.low + stats.out}</p>
            <p className="text-xs text-muted">low or out</p>
          </Card>
        </div>
      )}

      {stats.review > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-[14px] bg-review-50/70 px-3 py-2.5 text-[13px] text-ink-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-review" />
          {stats.review} record(s) list this location among several, but the spreadsheet does not say which container is stored here. They are included so nothing is missed.
        </p>
      )}

      <div className="mb-4 flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10 md:max-w-md">
        <Search className="size-4 text-muted" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search in ${data?.name ?? "this location"}`} className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        {term && (
          <button onClick={() => setTerm("")} className="text-muted hover:text-ink" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <ChemicalCardSkeleton key={i} />)}
        {items.map((c) => (
          <ChemicalCard
            key={c.id}
            chemical={c}
            query={term}
            locationFocus={data?.name}
            onOpen={() => {
              recordAccess(c.id, "browse");
              navigate(`/chemicals/${c.id}`);
            }}
          />
        ))}
      </div>
      {data && !items.length && (
        <EmptyState icon={<MapPin />} title={term ? "Nothing here matches" : "This location is empty"} description={term ? undefined : "Containers moved here will appear in this list."} />
      )}

      {editing && data && <LocationDialog open onOpenChange={setEditing} location={data} />}
    </div>
  );
}

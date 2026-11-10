import { MapPin, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, useInventoryMutation, useMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { EmptyState, Field, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";

export function LocationDialog({
  open,
  onOpenChange,
  location,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location?: { id: number; name: string; description: string | null };
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const navigate = useNavigate();
  const save = useInventoryMutation<unknown, { id?: number }>((body) =>
    location ? api(`/locations/${location.id}`, { method: "PATCH", json: body }) : api("/locations", { method: "POST", json: body }),
  );
  const submit = () => {
    if (!name.trim()) return toast.error("Location name is required");
    save.mutate(
      { name: name.trim(), description: description.trim() || null },
      {
        onSuccess: (res) => {
          toast.success(location ? "Location updated" : `Location ${name.trim()} added`);
          onOpenChange(false);
          if (!location && res.id) navigate(`/locations/${res.id}`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={location ? "Edit storage location" : "Add storage location"}
      description={location ? "Renaming updates every container stored here." : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Location code" hint="Short label used on shelves, e.g. R1, C4 or Fridge-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Solvent cabinet, lab 2, left side" />
        </Field>
      </div>
    </Modal>
  );
}

const groupOf = (name: string) => name.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? "Other";

export default function LocationsPage() {
  const { data: meta, isLoading } = useMeta();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focus = params.get("focus");
  const [term, setTerm] = useState(focus ?? "");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!focus || !meta) return;
    const hit = meta.locations.find((l) => l.name.toLowerCase() === focus.toLowerCase());
    if (hit) navigate(`/locations/${hit.id}`, { replace: true });
  }, [focus, meta, navigate]);

  const groups = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = (meta?.locations ?? []).filter((l) => !t || l.name.toLowerCase().includes(t) || l.description?.toLowerCase().includes(t));
    const m = new Map<string, typeof list>();
    for (const l of list) m.set(groupOf(l.name), [...(m.get(groupOf(l.name)) ?? []), l]);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [meta, term]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Storage locations"
        subtitle={meta ? `${meta.locations.length} locations. Open one to see everything stored there.` : "Where every container is kept."}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> <span className="max-sm:hidden">Add location</span>
          </Button>
        }
      />
      <div className="mb-5 flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10 md:max-w-md">
        <Search className="size-4 text-muted" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Find a location, e.g. R1" className="h-full flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted" aria-label="Search locations" />
        {term && (
          <button onClick={() => setTerm("")} className="text-muted hover:text-ink" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([g, list]) => (
          <section key={g}>
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {g === "Other" ? "Other" : `${g} · ${list.length}`}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {list.map((l) => (
                <Link key={l.id} to={`/locations/${l.id}`} className="group rounded-[28px] bg-surface shadow-[var(--shadow-1)] p-3.5 transition hover:border-navy/25 hover:shadow-[var(--shadow-soft)]">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-navy-50 text-navy">
                      <MapPin className="size-4" />
                    </span>
                    <span className="truncate font-mono text-[15px] font-semibold text-navy">{l.name}</span>
                  </div>
                  <p className="mt-2.5 text-[13px] text-ink">
                    <b className="tabular">{l.chemicalCount}</b> <span className="text-muted">chemicals</span>
                  </p>
                  <p className="truncate text-xs text-muted">{l.description ?? `${l.containerCount} containers`}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!isLoading && !groups.length && (
        <EmptyState
          icon={<MapPin />}
          title={term ? `No location called “${term}”` : "No storage locations yet"}
          action={<Button onClick={() => setAdding(true)}><Plus /> Add location</Button>}
        />
      )}
      {adding && <LocationDialog open onOpenChange={setAdding} />}
    </div>
  );
}

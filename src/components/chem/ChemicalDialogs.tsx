import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ChemicalDetail } from "@shared/types";
import { tokenize } from "@shared/importParse";
import { api, useInventoryMutation, useMeta } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { CategoryTree } from "@/components/search/Filters";

export function EditChemicalDialog({ chemical, open, onOpenChange }: { chemical: ChemicalDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({
    name: chemical.name,
    cas: chemical.cas ?? "",
    formula: chemical.formula ?? "",
    molecularWeight: chemical.molecularWeight?.toString() ?? "",
    chemicalClass: chemical.chemicalClass ?? "",
    description: chemical.description ?? "",
    notes: chemical.notes ?? "",
    hazardClassification: chemical.hazardClassification ?? "",
    hazardSource: chemical.hazardSource ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useInventoryMutation((body: Record<string, unknown>) => api(`/chemicals/${chemical.id}`, { method: "PATCH", json: body }));
  const hazardError = form.hazardClassification.trim() && !form.hazardSource.trim() ? "Cite the SDS / GHS source for any hazard information" : null;

  const submit = () => {
    if (!form.name.trim()) return toast.error("Chemical name is required");
    if (hazardError) return toast.error(hazardError);
    const mw = form.molecularWeight.trim() ? Number(form.molecularWeight) : null;
    if (mw !== null && !(mw > 0)) return toast.error("Molecular weight must be a positive number");
    save.mutate(
      {
        name: form.name,
        cas: form.cas || null,
        formula: form.formula || null,
        molecularWeight: mw,
        chemicalClass: form.chemicalClass || null,
        description: form.description || null,
        notes: form.notes || null,
        hazardClassification: form.hazardClassification || null,
        hazardSource: form.hazardSource || null,
      },
      {
        onSuccess: () => {
          toast.success("Chemical updated");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit chemical"
      description="Changes are saved to the inventory database and logged."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chemical name" className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} />
        </Field>
        <Field label="CAS number" hint="With or without hyphens">
          <Input value={form.cas} onChange={set("cas")} className="font-mono" placeholder="67-68-5" />
        </Field>
        <Field label="Chemical class">
          <Input value={form.chemicalClass} onChange={set("chemicalClass")} placeholder="e.g. Aromatic aldehyde" />
        </Field>
        <Field label="Formula" hint="Only enter verified values">
          <Input value={form.formula} onChange={set("formula")} className="font-mono" />
        </Field>
        <Field label="Molecular weight (g/mol)">
          <Input value={form.molecularWeight} onChange={set("molecularWeight")} inputMode="decimal" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description} onChange={set("description")} rows={2} />
        </Field>
        <Field label="Internal notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Handling notes, ordering info, who to ask…" />
        </Field>
        <div className="rounded-[14px] border border-line bg-surface-muted/60 p-3 sm:col-span-2">
          <p className="mb-3 text-xs text-muted">Hazard information is never inferred. Only record classifications taken from the supplier SDS or an official GHS source.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verified hazard classification">
              <Input value={form.hazardClassification} onChange={set("hazardClassification")} placeholder="e.g. H225, H319 – Flammable liquid" />
            </Field>
            <Field label="Source" error={hazardError}>
              <Input value={form.hazardSource} onChange={set("hazardSource")} placeholder="e.g. Finar SDS rev. 2024-03" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ClassificationDialog({ chemical, open, onOpenChange }: { chemical: ChemicalDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: meta } = useMeta();
  const [selected, setSelected] = useState<string[]>(chemical.categories.map((c) => c.slug));
  const [primary, setPrimary] = useState<string | null>(chemical.categories.find((c) => c.isPrimary)?.slug ?? null);
  const [tags, setTags] = useState(chemical.tags.join(", "));
  const [klass, setKlass] = useState(chemical.chemicalClass ?? "");
  const idBySlug = useMemo(() => {
    const m = new Map<string, { id: number; name: string }>();
    meta?.categories.forEach((c) => {
      m.set(c.slug, { id: c.id, name: c.name });
      c.children.forEach((s) => m.set(s.slug, { id: s.id, name: s.name }));
    });
    return m;
  }, [meta]);
  const save = useInventoryMutation((body: Record<string, unknown>) => api(`/chemicals/${chemical.id}/classification`, { method: "PUT", json: body }));

  const toggle = (slug: string) =>
    setSelected((s) => {
      let next = s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug];
      if (slug !== "unclassified" && next.length > 1) next = next.filter((x) => x !== "unclassified");
      return next;
    });
  const effectivePrimary = primary && selected.includes(primary) ? primary : selected[0];

  const submit = () => {
    if (!selected.length) return toast.error("Select at least one category (use Unclassified if unsure)");
    save.mutate(
      {
        categoryIds: selected.map((s) => idBySlug.get(s)!.id),
        primaryCategoryId: idBySlug.get(effectivePrimary)?.id,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        chemicalClass: klass.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Classification saved");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit classification"
      description="A chemical can belong to several categories. Pick the one that best describes how it is used as primary."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save classification
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <CategoryTree nodes={meta?.categories ?? []} isChecked={(s) => selected.includes(s)} onToggle={toggle} />
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Primary category</p>
            <div className="space-y-1.5">
              {selected.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrimary(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px]",
                    effectivePrimary === s ? "border-teal bg-teal-50 font-medium text-ink" : "border-line text-ink-2",
                  )}
                >
                  <span className={cn("size-3 rounded-full border-2", effectivePrimary === s ? "border-teal bg-teal" : "border-line-strong")} />
                  {idBySlug.get(s)?.name ?? s}
                </button>
              ))}
              {!selected.length && <p className="text-xs text-muted">No categories selected</p>}
            </div>
          </div>
          <Field label="Chemical class">
            <Input value={klass} onChange={(e) => setKlass(e.target.value)} placeholder="e.g. Aromatic aldehyde" />
          </Field>
          <Field label="Functional tags" hint="Comma separated">
            <Textarea value={tags} onChange={(e) => setTags(e.target.value)} rows={3} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

interface DraftContainer {
  brand: string;
  packSize: string;
  pct: string;
  location: string;
}

/** Lets a user split an ambiguous multi-value spreadsheet row into individual containers. */
export function ResolveDialog({
  chemical,
  record,
  open,
  onOpenChange,
}: {
  chemical: ChemicalDetail;
  record: ChemicalDetail["importRecords"][number];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: meta } = useMeta();
  const initial = useMemo<DraftContainer[]>(() => {
    const ex = (cell: string | null) => tokenize(cell).flatMap((t) => Array<string>(t.count).fill(t.value));
    const b = ex(record.raw.brand);
    const q = ex(record.raw.quantity);
    const a = ex(record.raw.available).map((v) => v.replace("%", "").trim());
    const l = ex(record.raw.location);
    const n = Math.max(b.length, q.length, a.length, l.length, 1);
    return Array.from({ length: n }, (_, i) => ({ brand: b[i] ?? "", packSize: q[i] ?? "", pct: a[i] ?? "", location: l[i] ?? "" }));
  }, [record]);
  const [rows, setRows] = useState<DraftContainer[]>(initial);
  const save = useInventoryMutation((body: unknown) => api(`/import-records/${record.id}/resolve`, { method: "POST", json: body }));
  const update = (i: number, k: keyof DraftContainer, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const submit = () => {
    for (const [i, r] of rows.entries()) {
      if (r.pct.trim() && !(Number(r.pct) >= 0 && Number(r.pct) <= 100)) return toast.error(`Container ${i + 1}: availability must be 0–100`);
    }
    save.mutate(
      {
        containers: rows.map((r) => ({
          brand: r.brand.trim() || null,
          packSize: r.packSize.trim() || null,
          remainingPercentage: r.pct.trim() ? Number(r.pct) : null,
          location: r.location.trim() || null,
        })),
      },
      {
        onSuccess: () => {
          toast.success(`Row ${record.originalRow} resolved into ${rows.length} containers`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Pair containers manually"
      description={`${chemical.name} · source row ${record.originalRow}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save {rows.length} container{rows.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-[14px] border border-review/20 bg-review-50/60 p-3 text-[13px]">
        <p className="mb-2 font-medium text-review">Original spreadsheet values</p>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-ink-2">
          <dt className="text-muted">Brand</dt>
          <dd className="font-mono text-[12px]">{record.raw.brand ?? "—"}</dd>
          <dt className="text-muted">Quantity</dt>
          <dd className="font-mono text-[12px]">{record.raw.quantity ?? "—"}</dd>
          <dt className="text-muted">Available (%)</dt>
          <dd className="font-mono text-[12px]">{record.raw.available ?? "—"}</dd>
          <dt className="text-muted">Location</dt>
          <dd className="font-mono text-[12px]">{record.raw.location ?? "—"}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted">
          The rows below are pre-filled in listed order as a starting point only. Check each container physically before saving.
        </p>
      </div>
      <div className="space-y-2">
        <div className="hidden grid-cols-[1.3fr_1fr_80px_1fr_36px] gap-2 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted sm:grid">
          <span>Brand</span>
          <span>Pack size</span>
          <span>Avail. %</span>
          <span>Location</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-[14px] border border-line p-2 sm:grid-cols-[1.3fr_1fr_80px_1fr_36px] sm:border-0 sm:p-0">
            <Input value={r.brand} onChange={(e) => update(i, "brand", e.target.value)} placeholder="Brand" list="resolve-brands" className="h-9" />
            <Input value={r.packSize} onChange={(e) => update(i, "packSize", e.target.value)} placeholder="500 mL" className="h-9" />
            <Input value={r.pct} onChange={(e) => update(i, "pct", e.target.value)} placeholder="%" inputMode="decimal" className="h-9 tabular" />
            <Input value={r.location} onChange={(e) => update(i, "location", e.target.value)} placeholder="R1" list="resolve-locations" className="h-9 font-mono" />
            <Button variant="danger-ghost" size="icon-sm" className="max-sm:col-span-2 max-sm:w-full" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove container" disabled={rows.length === 1}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <datalist id="resolve-brands">{meta?.brands.map((b) => <option key={b.value} value={b.value} />)}</datalist>
        <datalist id="resolve-locations">{meta?.locations.map((l) => <option key={l.id} value={l.name} />)}</datalist>
        <Button variant="ghost" size="sm" onClick={() => setRows((x) => [...x, { brand: "", packSize: "", pct: "", location: "" }])}>
          <Plus /> Add container
        </Button>
      </div>
    </Modal>
  );
}

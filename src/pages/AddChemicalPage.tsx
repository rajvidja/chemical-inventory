import { CircleCheck, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { ChemicalDetail } from "@shared/types";
import { api, ApiError, useInventoryMutation, useMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";
import { CategoryTree } from "@/components/search/Filters";
import { useChemActions } from "@/components/chem/ChemActions";
import { BackButton } from "./ChemicalPage";

interface CasCheck {
  cas: string;
  valid: boolean;
  reason: string | null;
  existing: { id: number; name: string; containerCount: number }[];
  pubchem: { title: string | null; formula: string | null; mw: number | null } | null;
}

interface Draft {
  brand: string;
  packSize: string;
  pct: string;
  location: string;
  expiry: string;
}
const blank: Draft = { brand: "", packSize: "", pct: "100", location: "", expiry: "" };

export default function AddChemicalPage() {
  const navigate = useNavigate();
  const actions = useChemActions();
  const { data: meta } = useMeta();
  const [name, setName] = useState("");
  const [params] = useSearchParams();
  const [cas, setCas] = useState(params.get("cas") ?? "");
  const [check, setCheck] = useState<CasCheck | null>(null);
  const [synonyms, setSynonyms] = useState("");
  const [notes, setNotes] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [rows, setRows] = useState<Draft[]>([{ ...blank }]);
  const [allowDup, setAllowDup] = useState(false);

  const idBySlug = useMemo(() => {
    const m = new Map<string, number>();
    meta?.categories.forEach((c) => {
      m.set(c.slug, c.id);
      c.children.forEach((s) => m.set(s.slug, s.id));
    });
    return m;
  }, [meta]);

  const create = useInventoryMutation((body: unknown) => api<ChemicalDetail>("/chemicals", { method: "POST", json: body }));

  const runCheck = async () => {
    if (!cas.trim()) return setCheck(null);
    try {
      const r = await api<CasCheck>(`/chemicals/check-cas?cas=${encodeURIComponent(cas.trim())}`);
      setCheck(r);
      if (r.valid) setCas(r.cas);
      if (r.pubchem?.title && !name.trim()) setName(r.pubchem.title);
    } catch {
      setCheck(null);
    }
  };

  useEffect(() => {
    if (cas) void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToExisting = async (id: number) => {
    const chem = await api<ChemicalDetail>(`/chemicals/${id}`);
    navigate(`/chemicals/${id}`);
    actions.addContainer(chem);
  };

  const update = (i: number, k: keyof Draft, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Chemical name is required");
    for (const [i, r] of rows.entries()) {
      if (r.pct.trim() && !(Number(r.pct) >= 0 && Number(r.pct) <= 100)) return toast.error(`Container ${i + 1}: availability must be between 0 and 100`);
    }
    const containers = rows
      .filter((r) => r.brand || r.packSize || r.location || r.pct)
      .map((r) => ({
        brand: r.brand.trim() || null,
        packSize: r.packSize.trim() || null,
        remainingPercentage: r.pct.trim() ? Number(r.pct) : null,
        location: r.location.trim() || null,
        expiryDate: r.expiry || null,
      }));
    create.mutate(
      {
        name: name.trim(),
        cas: cas.trim() || null,
        notes: notes.trim() || null,
        categoryIds: cats.map((s) => idBySlug.get(s)!).filter(Boolean),
        synonyms: synonyms.split(",").map((s) => s.trim()).filter(Boolean),
        containers,
        allowDuplicateCas: allowDup,
      },
      {
        onSuccess: (chem) => {
          toast.success(`${chem.name} added to inventory`);
          navigate(`/chemicals/${chem.id}`, { replace: true });
        },
        onError: (err) => {
          if (err instanceof ApiError && err.body.error === "duplicate_cas") {
            void runCheck();
            toast.error("This CAS number already exists. Add a container to the existing record, or confirm it is a different product.");
          } else toast.error(err.message);
        },
      },
    );
  };

  const duplicate = check?.existing.length ? check.existing : null;

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl animate-fade-in">
      <BackButton />
      <PageHeader title="Add chemical" subtitle="Create a new chemical record with one or more stock containers." />

      <div className="space-y-4">
        <Card className="p-4 md:p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CAS number" hint="Checked against existing records when you leave the field" error={check && !check.valid ? `CAS ${check.reason === "checksum" ? "check digit does not validate" : "format looks wrong"} – double-check the label` : null}>
              <Input value={cas} onChange={(e) => { setCas(e.target.value); setCheck(null); setAllowDup(false); }} onBlur={runCheck} placeholder="e.g. 75-05-8" className="font-mono" />
            </Field>
            <Field label="Chemical name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acetonitrile" required />
            </Field>
          </div>

          {check?.valid && check.pubchem && (
            <p className="mt-3 flex items-center gap-2 text-xs text-success">
              <CircleCheck className="size-4" /> PubChem: {check.pubchem.title} · {check.pubchem.formula} · {check.pubchem.mw} g/mol. Formula and MW are added automatically if the name matches.
            </p>
          )}

          {duplicate && (
            <div className="mt-4 rounded-[14px] border border-warning/40 bg-warning-50/70 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <TriangleAlert className="size-4 text-warning-700" /> CAS {check?.cas} is already in the inventory
              </p>
              <p className="mt-1 text-[13px] text-ink-2">To avoid duplicate records, add the new bottle as a container of the existing chemical.</p>
              <div className="mt-3 space-y-2">
                {duplicate.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {d.name} <span className="font-normal text-muted">· {d.containerCount} containers</span>
                    </span>
                    <Button type="button" size="sm" onClick={() => addToExisting(d.id)}>
                      Add container
                    </Button>
                  </div>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} className="accent-teal" />
                This is a different product (e.g. another grade) – create a separate record anyway
              </label>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Synonyms & abbreviations" hint="Comma separated – all are searchable">
              <Input value={synonyms} onChange={(e) => setSynonyms(e.target.value)} placeholder="e.g. MeCN, ACN" />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} className="min-h-10" />
            </Field>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Stock containers</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((r) => [...r, { ...blank }])}>
              <Plus /> Add container
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-[14px] border border-line p-2.5 sm:grid-cols-[1.3fr_1fr_80px_1fr_150px_36px] sm:border-0 sm:p-0">
                <Input value={r.brand} onChange={(e) => update(i, "brand", e.target.value)} placeholder="Brand" list="add-brands" aria-label="Brand" />
                <Input value={r.packSize} onChange={(e) => update(i, "packSize", e.target.value)} placeholder="Pack size (500 mL)" aria-label="Pack size" />
                <Input value={r.pct} onChange={(e) => update(i, "pct", e.target.value)} placeholder="%" inputMode="decimal" aria-label="Available %" className="tabular" />
                <Input value={r.location} onChange={(e) => update(i, "location", e.target.value)} placeholder="Location" list="add-locations" aria-label="Location" className="font-mono" />
                <Input type="date" value={r.expiry} onChange={(e) => update(i, "expiry", e.target.value)} aria-label="Expiry date (optional)" title="Expiry date (optional)" className="max-sm:col-span-2" />
                <Button type="button" variant="danger-ghost" size="icon" className="max-sm:col-span-2 max-sm:w-full" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove container">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <datalist id="add-brands">{meta?.brands.map((b) => <option key={b.value} value={b.value} />)}</datalist>
            <datalist id="add-locations">{meta?.locations.map((l) => <option key={l.id} value={l.name} />)}</datalist>
          </div>
          <p className="mt-2 text-xs text-muted">Brand · pack size · % available · location · expiry date (optional)</p>
        </Card>

        <Card className="p-4 md:p-5">
          <h2 className="mb-1 text-[15px] font-semibold text-ink">Classification</h2>
          <p className="mb-4 text-xs text-muted">Optional. Leave empty to file it under Unclassified for later review.</p>
          <CategoryTree nodes={meta?.categories ?? []} isChecked={(s) => cats.includes(s)} onToggle={(s) => setCats((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]))} />
        </Card>
      </div>

      <div className="sticky bottom-20 z-10 mt-5 flex justify-end gap-2 rounded-[20px] border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!!duplicate && !allowDup}>
          Save chemical
        </Button>
      </div>
    </form>
  );
}

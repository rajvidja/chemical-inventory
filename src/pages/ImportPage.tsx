import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, History, Loader2, RotateCcw, TriangleAlert, Upload, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { ParsedContainer, RawRow, RowIssue } from "@shared/importParse";
import { api, ApiError, useInventoryMutation } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Segmented } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";
import { Cas, LocationBadge } from "@/components/chem/bits";

interface PreviewRow {
  rowNumber: number;
  raw: RawRow;
  name: string;
  cas: string | null;
  casValid: boolean;
  pairing: "single" | "paired" | "ambiguous";
  containers: ParsedContainer[];
  issues: RowIssue[];
  status: "imported" | "imported_with_warnings" | "needs_review" | "error";
  existingMatches: { id: number; name: string }[];
  duplicateOfRow: number | null;
}
interface Preview {
  token: string;
  fileName: string;
  sheetName: string;
  rows: PreviewRow[];
  summary: { total: number; clean: number; warnings: number; review: number; errors: number; existingDuplicates: number; containers: number };
}
interface Summary {
  rows: number;
  chemicalsCreated: number;
  appendedToExisting: number;
  skipped: number;
  containersCreated: number;
  needsReview: number;
  withWarnings: number;
}
type Decision = { mode: "new" } | { mode: "skip" } | { mode: "append"; chemicalId: number };

const STATUS_UI: Record<PreviewRow["status"], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  imported: { label: "Ready", cls: "text-success bg-success-50", icon: CheckCircle2 },
  imported_with_warnings: { label: "Warning", cls: "text-warning-700 bg-warning-50", icon: TriangleAlert },
  needs_review: { label: "Needs review", cls: "text-review bg-review-50", icon: CircleAlert },
  error: { label: "Error", cls: "text-danger bg-danger-50", icon: XCircle },
};

type Tab = "all" | "issues" | "existing" | "errors";

export default function ImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(100);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<{ items: { id: number; file_name: string; kind: string; row_count: number; summary: Summary | null; imported_at: string }[] }>("/import/batches"),
  });

  const commit = useInventoryMutation((body: unknown) => api<Summary>("/import/commit", { method: "POST", json: body }));

  const upload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const p = await api<Preview>("/import/preview", { method: "POST", body: fd });
      setPreview(p);
      // Rows already in the inventory are skipped unless the user chooses otherwise, so re-importing never silently duplicates stock.
      setDecisions(Object.fromEntries(p.rows.filter((r) => r.existingMatches.length).map((r) => [r.rowNumber, { mode: "skip" } as Decision])));
      setTab("all");
      setLimit(100);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const rows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) =>
      tab === "all" ? true : tab === "issues" ? r.issues.length > 0 : tab === "existing" ? r.existingMatches.length > 0 || r.duplicateOfRow !== null : r.status === "error",
    );
  }, [preview, tab]);

  const decide = (row: number, d: Decision) => setDecisions((x) => ({ ...x, [row]: d }));
  const bulkExisting = (mode: "skip" | "append" | "new") => {
    if (!preview) return;
    setDecisions((x) => {
      const next = { ...x };
      for (const r of preview.rows) {
        if (!r.existingMatches.length) continue;
        next[r.rowNumber] = mode === "append" ? { mode, chemicalId: r.existingMatches[0].id } : { mode };
      }
      return next;
    });
  };

  const toImport = preview ? preview.rows.filter((r) => r.status !== "error" && decisions[r.rowNumber]?.mode !== "skip").length : 0;

  const onCommit = () => {
    if (!preview) return;
    commit.mutate(
      { token: preview.token, decisions },
      {
        onSuccess: (s) => {
          setResult(s);
          setPreview(null);
          void batches.refetch();
          toast.success(`Imported ${s.rows - s.skipped} rows`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Import & export" subtitle="Add stock from Excel or CSV. Every row is validated and previewed before anything is saved." />

      {!preview && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {result && (
              <Card className="border-success/30 p-4 md:p-5">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  <CheckCircle2 className="size-5 text-success" /> Import complete
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Stat label="New chemicals" value={result.chemicalsCreated} />
                  <Stat label="Added to existing" value={result.appendedToExisting} />
                  <Stat label="Containers" value={result.containersCreated} />
                  <Stat label="Skipped" value={result.skipped} />
                </div>
                {result.needsReview > 0 && (
                  <p className="mt-3 text-[13px] text-ink-2">
                    {result.needsReview} rows were kept unpaired for review. <Link to="/review" className="font-medium text-teal hover:underline">Open data review</Link>
                  </p>
                )}
              </Card>
            )}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) void upload(f);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed bg-surface px-6 py-12 text-center transition",
                drag ? "border-teal bg-teal-50/50" : "border-line hover:border-line-strong",
              )}
            >
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <span className="mb-3 grid size-12 place-items-center rounded-[20px] bg-navy-50 text-navy">
                {uploading ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </span>
              <p className="text-[15px] font-semibold text-ink">{uploading ? "Reading spreadsheet…" : "Drop an Excel or CSV file here"}</p>
              <p className="mt-1 text-sm text-muted">or click to choose · .xlsx, .xls, .csv up to 10 MB</p>
            </label>
            <Card className="p-4 text-[13px] text-ink-2">
              <p className="mb-2 font-medium text-ink">Expected columns</p>
              <div className="flex flex-wrap gap-1.5">
                {["Sr. No.", "Chemical Name", "CAS No.", "Brand", "Quantity", "Available (%)", "Storage Location"].map((c) => (
                  <span key={c} className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-xs ring-1 ring-line">
                    {c}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                Cells may list several containers, e.g. <span className="font-mono">Finar(2), TCI</span>. They are split into separate containers only when brand, quantity, percentage and
                location line up exactly; otherwise the row is kept as-is and flagged for review.
              </p>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <p className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Download className="size-4 text-navy" /> Export inventory
              </p>
              <p className="mb-3 text-xs text-muted">One row per container. Unpaired rows are exported with their original values.</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" asChild>
                  <a href="/api/export?format=xlsx" download>
                    <FileSpreadsheet /> Excel
                  </a>
                </Button>
                <Button variant="secondary" className="flex-1" asChild>
                  <a href="/api/export?format=csv" download>
                    CSV
                  </a>
                </Button>
              </div>
            </Card>
            <Card className="p-4">
              <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <History className="size-4 text-navy" /> Import history
              </p>
              <ul className="space-y-2.5">
                {batches.data?.items.map((b) => (
                  <li key={b.id} className="text-[13px]">
                    <p className="truncate font-medium text-ink">{b.file_name}</p>
                    <p className="text-xs text-muted">
                      {b.kind === "seed" ? "Initial import" : "Upload"} · {b.row_count} rows · {timeAgo(b.imported_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-ink">{preview.fileName}</p>
                <p className="text-xs text-muted">Sheet “{preview.sheetName}” · nothing has been saved yet</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                <RotateCcw /> Choose another file
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="Rows" value={preview.summary.total} />
              <Stat label="Ready" value={preview.summary.clean} tone="text-success" />
              <Stat label="Warnings" value={preview.summary.warnings} tone="text-warning-700" />
              <Stat label="For review" value={preview.summary.review} tone="text-review" />
              <Stat label="Errors" value={preview.summary.errors} tone="text-danger" />
              <Stat label="Already in inventory" value={preview.summary.existingDuplicates} />
            </div>
            {preview.summary.existingDuplicates > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] bg-surface-muted p-3 text-[13px] text-ink-2">
                <span className="flex-1">{preview.summary.existingDuplicates} rows match a CAS number already in the inventory. For all of them:</span>
                <Button size="sm" variant="secondary" onClick={() => bulkExisting("skip")}>Skip</Button>
                <Button size="sm" variant="secondary" onClick={() => bulkExisting("append")}>Add as containers</Button>
                <Button size="sm" variant="secondary" onClick={() => bulkExisting("new")}>Create new records</Button>
              </div>
            )}
          </Card>

          <Segmented
            value={tab}
            onChange={(v) => { setTab(v); setLimit(100); }}
            options={[
              { value: "all", label: `All ${preview.rows.length}` },
              { value: "issues", label: "With notes" },
              { value: "existing", label: "Duplicates" },
              { value: "errors", label: "Errors" },
            ]}
          />

          <Card className="divide-y divide-line overflow-hidden">
            {rows.slice(0, limit).map((r) => {
              const S = STATUS_UI[r.status];
              const d = decisions[r.rowNumber] ?? { mode: "new" };
              return (
                <div key={r.rowNumber} className={cn("p-3.5 md:px-4", d.mode === "skip" && "opacity-55")}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                    <span className="w-12 shrink-0 pt-0.5 text-xs text-muted tabular">Row {r.rowNumber}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{r.name || <span className="text-danger">Missing name</span>}</p>
                        <Cas cas={r.cas} valid={r.casValid} />
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium", S.cls)}>
                          <S.icon className="size-3" /> {S.label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.pairing === "ambiguous" ? (
                          <span className="text-xs text-muted">
                            Kept unpaired: <span className="font-mono">{[r.raw.brand, r.raw.quantity, r.raw.available, r.raw.location].map((v) => v ?? "—").join(" | ")}</span>
                          </span>
                        ) : (
                          r.containers.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-2 py-0.5 text-xs text-ink-2">
                              {[c.brand, c.packSize, c.percentage !== null ? `${c.percentage}%` : null].filter(Boolean).join(" · ") || "No details"}
                              {c.location && <LocationBadge name={c.location} />}
                            </span>
                          ))
                        )}
                      </div>
                      {r.issues.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
                          {r.issues.map((i, k) => (
                            <li key={k} className={cn(i.level === "error" && "text-danger")}>• {i.message}</li>
                          ))}
                        </ul>
                      )}
                      {r.duplicateOfRow !== null && <p className="mt-1 text-xs text-muted">Same CAS as row {r.duplicateOfRow} in this file – both are kept as separate records.</p>}
                    </div>
                    {r.status !== "error" && (
                      <select
                        value={d.mode === "append" ? `append:${d.chemicalId}` : d.mode}
                        onChange={(e) => {
                          const v = e.target.value;
                          decide(r.rowNumber, v.startsWith("append:") ? { mode: "append", chemicalId: Number(v.split(":")[1]) } : ({ mode: v } as Decision));
                        }}
                        className="h-9 max-w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-teal"
                        aria-label={`Action for row ${r.rowNumber}`}
                      >
                        <option value="new">{r.existingMatches.length ? "Create new record" : "Import"}</option>
                        {r.existingMatches.map((m) => (
                          <option key={m.id} value={`append:${m.id}`}>
                            Add containers to “{m.name.length > 28 ? `${m.name.slice(0, 28)}…` : m.name}”
                          </option>
                        ))}
                        <option value="skip">Skip</option>
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
            {!rows.length && <p className="p-6 text-center text-sm text-muted">No rows in this view.</p>}
          </Card>
          {rows.length > limit && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + 200)}>
                Show more ({rows.length - limit} remaining)
              </Button>
            </div>
          )}

          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-3 rounded-[20px] border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
            <p className="flex-1 text-[13px] text-ink-2">
              <b className="text-ink">{toImport}</b> rows will be imported{preview.summary.errors ? `, ${preview.summary.errors} with errors are logged but not imported` : ""}.
            </p>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={onCommit} loading={commit.isPending} disabled={!toImport}>
              Import {toImport} rows
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[14px] bg-surface-muted px-3 py-2">
      <p className={cn("text-lg font-semibold text-ink tabular", tone)}>{value}</p>
      <p className="truncate text-[11.5px] text-muted">{label}</p>
    </div>
  );
}

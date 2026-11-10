import { Database, Download, FileSpreadsheet, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DEFAULT_THRESHOLDS, STATUS_LABEL, type StockStatus } from "@shared/stock";
import { api, useInventoryMutation, useMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/AppShell";
import { STATUS_STYLE } from "@/components/chem/bits";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { data: meta } = useMeta();
  const [good, setGood] = useState("");
  const [low, setLow] = useState("");
  useEffect(() => {
    if (meta) {
      setGood(String(meta.thresholds.goodAbove));
      setLow(String(meta.thresholds.lowBelow));
    }
  }, [meta]);
  const save = useInventoryMutation((body: unknown) => api("/settings", { method: "PUT", json: body }));

  const g = Number(good);
  const l = Number(low);
  const valid = g >= 1 && g <= 99 && l >= 1 && l <= 99 && l <= g;
  const bands: { status: StockStatus; range: string }[] = [
    { status: "good", range: `above ${g}%` },
    { status: "moderate", range: `${l}% – ${g}%` },
    { status: "low", range: l > 1 ? `1% – ${l - 1}%` : "—" },
    { status: "out", range: "0%" },
  ];

  const submit = (body = { goodAbove: g, lowBelow: l }) =>
    save.mutate(body, {
      onSuccess: () => toast.success("Stock thresholds saved. All statuses and alerts were recalculated."),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card className="p-4 md:p-5">
          <h2 className="text-[15px] font-semibold text-ink">Stock thresholds</h2>
          <p className="mb-4 mt-0.5 text-[13px] text-muted">Controls how each container's remaining percentage maps to a status, everywhere in the app.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Good stock is above (%)">
              <Input type="number" min={1} max={99} value={good} onChange={(e) => setGood(e.target.value)} className="tabular" />
            </Field>
            <Field label="Low stock is below (%)" error={!valid && good && low ? "Must be between 1 and 99, and not above the good-stock value" : null}>
              <Input type="number" min={1} max={99} value={low} onChange={(e) => setLow(e.target.value)} className="tabular" />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bands.map((b) => (
              <div key={b.status} className={cn("rounded-[14px] px-3 py-2.5", STATUS_STYLE[b.status].bg)}>
                <p className={cn("text-[13px] font-semibold", STATUS_STYLE[b.status].text)}>{STATUS_LABEL[b.status]}</p>
                <p className="text-xs text-ink-2 tabular">{valid ? b.range : "—"}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setGood(String(DEFAULT_THRESHOLDS.goodAbove)); setLow(String(DEFAULT_THRESHOLDS.lowBelow)); submit(DEFAULT_THRESHOLDS); }}>
              Reset to defaults
            </Button>
            <Button disabled={!valid} loading={save.isPending} onClick={() => submit()}>
              Save thresholds
            </Button>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Data</h2>
          <div className="space-y-3 text-[13px] text-ink-2">
            <p className="flex items-start gap-2.5">
              <Database className="mt-0.5 size-4 shrink-0 text-navy" />
              Inventory is stored in an embedded PostgreSQL database on the server, not in the browser. The browser only caches recent results for offline viewing.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" asChild>
                <Link to="/import">
                  <FileSpreadsheet /> Import spreadsheet
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/api/export?format=xlsx" download>
                  <Download /> Export Excel
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/api/export?format=csv" download>
                  <Download /> Export CSV
                </a>
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Smartphone className="size-4 text-navy" /> Install on your phone
          </h2>
          <p className="text-[13px] text-ink-2">
            ChemStock works as an installable app. On iPhone, open it in Safari, tap Share, then <b>Add to Home Screen</b>. On Android, use the browser menu and choose <b>Install app</b>.
          </p>
        </Card>
      </div>
    </div>
  );
}

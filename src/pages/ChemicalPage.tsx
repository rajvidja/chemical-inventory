import { ChevronLeft, SearchX } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useChemical } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { ChemicalDetailSkeleton, ChemicalDetailView } from "@/components/chem/ChemicalDetailView";

export function BackButton({ label = "Back", fallback = "/inventory" }: { label?: string; fallback?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))}
      className="group mb-4 inline-flex h-11 items-center gap-2.5 rounded-full pr-3 text-sm font-semibold text-ink-2 hover:text-ink"
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface shadow-[var(--shadow-1)] transition group-hover:shadow-[var(--shadow-2)]">
        <ChevronLeft className="size-5" />
      </span>
      {label}
    </button>
  );
}

export default function ChemicalPage() {
  const id = Number(useParams().id);
  const { data, isLoading, isError } = useChemical(Number.isFinite(id) ? id : null);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-6xl">
      <BackButton />
      {isLoading && <ChemicalDetailSkeleton />}
      {isError && (
        <EmptyState
          icon={<SearchX />}
          title="Chemical not found"
          description="It may have been deleted or merged into another record."
          action={<Button onClick={() => navigate("/search")}>Search inventory</Button>}
        />
      )}
      {data && <ChemicalDetailView chemical={data} />}
    </div>
  );
}

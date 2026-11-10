import { Maximize2 } from "lucide-react";
import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ChemicalListItem } from "@shared/types";
import { recordAccess, useChemical, useRecordSearch } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks";
import { ChemicalDetailSkeleton, ChemicalDetailView } from "./ChemicalDetailView";

/** Split view is used when there is room for a results column next to a ~460px detail panel. */
export function useSplitView() {
  return useMediaQuery("(min-width: 1280px)");
}

export function useOpenChemical({
  split,
  setSelected,
  q,
  total,
  source,
}: {
  split: boolean;
  setSelected: (id: number | null) => void;
  q?: string;
  total?: number;
  source: "search" | "browse";
}) {
  const navigate = useNavigate();
  const record = useRecordSearch();
  return useCallback(
    (c: Pick<ChemicalListItem, "id">) => {
      recordAccess(c.id, source);
      if (q?.trim()) record.mutate({ query: q.trim(), resultCount: total ?? 0 });
      if (split) setSelected(c.id);
      else navigate(`/chemicals/${c.id}`);
    },
    [split, setSelected, q, total, source, navigate, record],
  );
}

export function DetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading, isError } = useChemical(id);
  return (
    <aside className="sticky top-6 max-h-[calc(100dvh-3rem)] w-[460px] shrink-0 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface-muted p-4 scrollbar-none">
      {isLoading && <ChemicalDetailSkeleton />}
      {isError && <p className="p-6 text-center text-sm text-muted">This chemical could not be loaded. It may have been deleted.</p>}
      {data && (
        <>
          <div className="mb-2 flex justify-end">
            <Link to={`/chemicals/${id}`} className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline">
              <Maximize2 className="size-3" /> Open full page
            </Link>
          </div>
          <ChemicalDetailView chemical={data} compact onClose={onClose} />
        </>
      )}
    </aside>
  );
}

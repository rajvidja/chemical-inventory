import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { SuggestionPick } from "@/components/search/SearchBar";
import { recordAccess } from "./api";

/** Default behaviour for a search-bar pick when the bar lives outside the search page. */
export function usePickNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (p: SuggestionPick) => {
      switch (p.kind) {
        case "chemical":
          recordAccess(p.id, "search");
          return navigate(`/chemicals/${p.id}`);
        case "query":
          return navigate(`/search?q=${encodeURIComponent(p.value)}`);
        case "location":
          return navigate(`/search?location=${encodeURIComponent(p.value)}`);
        case "brand":
          return navigate(`/search?brand=${encodeURIComponent(p.value)}`);
        case "category":
          return navigate(`/search?category=${encodeURIComponent(p.value)}`);
      }
    },
    [navigate],
  );
}

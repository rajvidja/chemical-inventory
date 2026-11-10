import { ArrowUpLeft, Clock, Factory, FlaskConical, Loader2, MapPin, Search, TrendingUp, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useClearHistory, useSearchHistory, useSuggest } from "@/lib/api";
import { useDebounced, useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CategoryIcon, Highlight, LocationBadge, STATUS_STYLE } from "@/components/chem/bits";

export type SuggestionPick =
  | { kind: "query"; value: string }
  | { kind: "chemical"; id: number; name: string }
  | { kind: "location"; value: string }
  | { kind: "brand"; value: string }
  | { kind: "category"; value: string; name: string };

export interface SearchBarHandle {
  focus: () => void;
  blur: () => void;
}

const PLACEHOLDER = "Search chemical name, CAS, brand or location";

export const SearchBar = forwardRef<
  SearchBarHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onPick: (p: SuggestionPick) => void;
    autoFocus?: boolean;
    size?: "lg" | "md";
    suggestions?: boolean;
    className?: string;
    onFocusChange?: (focused: boolean) => void;
    placeholder?: string;
  }
>(({ value, onChange, onPick, autoFocus, size = "lg", suggestions = true, className, onFocusChange, placeholder: placeholderProp }, ref) => {
  const narrow = useMediaQuery("(max-width: 479px)");
  const placeholder = placeholderProp ?? (narrow ? "Name, CAS, brand or location" : PLACEHOLDER);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(value, 110);
  const suggest = useSuggest(suggestions && focused ? debounced : "");
  const history = useSearchHistory();
  const clear = useClearHistory();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), blur: () => inputRef.current?.blur() }));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const setOpen = (f: boolean) => {
    setFocused(f);
    onFocusChange?.(f);
    if (!f) setActive(-1);
  };

  const typed = value.trim().length > 0;
  const data = suggest.data;
  const options = useMemo<SuggestionPick[]>(() => {
    if (!typed) return (history.data?.recent ?? []).slice(0, 6).map((r) => ({ kind: "query" as const, value: r.query }));
    if (!data) return [];
    return [
      ...data.chemicals.slice(0, 6).map((c) => ({ kind: "chemical" as const, id: c.id, name: c.name })),
      ...data.locations.map((l) => ({ kind: "location" as const, value: l.name })),
      ...data.brands.map((b) => ({ kind: "brand" as const, value: b.name })),
      ...data.categories.map((c) => ({ kind: "category" as const, value: c.slug, name: c.name })),
    ];
  }, [typed, data, history.data]);

  const pick = (p: SuggestionPick) => {
    onPick(p);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && options[active]) pick(options[active]);
      else if (value.trim()) pick({ kind: "query", value: value.trim() });
    } else if (e.key === "Escape") {
      if (value) onChange("");
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  const showPanel = suggestions && focused && (typed ? !!data || suggest.isFetching : true);
  const chemCount = typed ? (data?.chemicals.slice(0, 6).length ?? 0) : 0;
  const locCount = data?.locations.length ?? 0;
  const brandCount = data?.brands.length ?? 0;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-3 border-2 bg-surface transition-[border-color,box-shadow]",
          size === "lg" ? "h-14 rounded-[20px] px-5" : "h-12 rounded-[16px] px-4",
          focused ? "border-ink shadow-[var(--shadow-2)]" : "border-transparent shadow-[var(--shadow-1)] hover:border-line",
        )}
      >
        {suggest.isFetching && typed ? (
          <Loader2 className={cn("shrink-0 animate-spin text-ink", size === "lg" ? "size-5" : "size-4")} />
        ) : (
          <Search className={cn("shrink-0 text-ink", size === "lg" ? "size-5" : "size-4")} strokeWidth={2.4} />
        )}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
          aria-label="Search chemicals"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            if (!focused) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none placeholder:font-medium placeholder:text-faint",
            size === "lg" ? "text-[16px]" : "text-[15px]",
          )}
        />
        {value && (
          <button
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition hover:bg-line-strong hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+8px)] z-40 max-h-[min(70dvh,560px)] overflow-y-auto rounded-[20px] border border-line bg-surface p-2 shadow-[var(--shadow-2)] animate-fade-in"
        >
          {!typed && (
            <>
              {history.data?.recent.length ? (
                <div>
                  <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Recent searches</span>
                    <button onClick={() => clear.mutate(undefined)} className="text-xs font-bold text-blue hover:underline">
                      Clear all
                    </button>
                  </div>
                  {history.data.recent.slice(0, 6).map((r, i) => (
                    <div
                      key={r.query}
                      role="option"
                      aria-selected={active === i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick({ kind: "query", value: r.query })}
                      className={cn("group flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2", active === i && "bg-surface-muted")}
                    >
                      <Clock className="size-4 shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm text-ink">{r.query}</span>
                      <span className="text-xs text-muted tabular">{r.resultCount}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clear.mutate(r.query);
                        }}
                        className="grid size-6 place-items-center rounded-full text-muted opacity-0 transition hover:bg-line group-hover:opacity-100 max-md:opacity-100"
                        aria-label={`Remove ${r.query} from history`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {history.data?.popular.length ? (
                <div className="mt-1 px-2 pb-1">
                  <p className="pb-2 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Frequently searched</p>
                  <div className="flex flex-wrap gap-1.5">
                    {history.data.popular.map((p) => (
                      <button
                        key={p.query}
                        onClick={() => pick({ kind: "query", value: p.query })}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-sunken px-3 text-xs font-semibold text-ink-2 hover:bg-line"
                      >
                        <TrendingUp className="size-3 text-ink" /> {p.query}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!history.data?.recent.length && (
                <div className="px-2 py-2">
                  <p className="pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Try searching for</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["DMSO", "Acetoni", "67-68-5", "R1", "Finar", "Coupling reagents", "F2B1"].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          onChange(s);
                          inputRef.current?.focus();
                        }}
                        className="h-8 rounded-full bg-sunken px-3 text-xs font-semibold text-ink-2 hover:bg-ink hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Partial names, abbreviations, CAS with or without hyphens, brands, storage codes and categories all work. Typos are tolerated.
                  </p>
                </div>
              )}
            </>
          )}

          {typed && data && options.length === 0 && !suggest.isFetching && (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-ink">No matches for “{value}”</p>
              <p className="mt-1 text-xs text-muted">Check the spelling, try fewer characters, or search by CAS number or location code.</p>
            </div>
          )}

          {typed &&
            data?.chemicals.slice(0, 6).map((c, i) => {
              const loc = [...new Set(c.containers.flatMap((x) => (x.location ? [x.location] : x.mentionedLocations)))];
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick({ kind: "chemical", id: c.id, name: c.name })}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2", active === i && "bg-surface-muted")}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink">
                    <FlaskConical className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      <Highlight text={c.name} query={value} />
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                      {c.cas && (
                        <span className="font-mono">
                          <Highlight text={c.cas} query={value} />
                        </span>
                      )}
                      {c.match && c.match.field === "synonym" && (
                        <span className="truncate">
                          · <Highlight text={c.match.text} query={value} />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden items-center gap-1 sm:flex">
                    {loc.slice(0, 2).map((l) => (
                      <LocationBadge key={l} name={l} />
                    ))}
                  </div>
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_STYLE[c.status].dot)} title={c.status} />
                </div>
              );
            })}

          {typed && data && (locCount > 0 || brandCount > 0 || data.categories.length > 0) && (
            <div className="mt-1 border-t border-line pt-1">
              {data.locations.map((l, j) => {
                const i = chemCount + j;
                return (
                  <JumpRow key={l.name} active={active === i} onHover={() => setActive(i)} onClick={() => pick({ kind: "location", value: l.name })} icon={<MapPin />} label={<>Location <span className="font-mono font-semibold text-navy">{l.name}</span></>} count={l.count} />
                );
              })}
              {data.brands.map((b, j) => {
                const i = chemCount + locCount + j;
                return <JumpRow key={b.name} active={active === i} onHover={() => setActive(i)} onClick={() => pick({ kind: "brand", value: b.name })} icon={<Factory />} label={<>Brand <b className="font-semibold text-ink"><Highlight text={b.name} query={value} /></b></>} count={b.count} />;
              })}
              {data.categories.map((c, j) => {
                const i = chemCount + locCount + brandCount + j;
                return <JumpRow key={c.slug} active={active === i} onHover={() => setActive(i)} onClick={() => pick({ kind: "category", value: c.slug, name: c.name })} icon={<CategoryIcon icon={c.icon} />} label={<>Category <b className="font-semibold text-ink"><Highlight text={c.name} query={value} /></b></>} count={c.count} />;
              })}
            </div>
          )}

          {typed && data && data.chemicals.length > 0 && (
            <button
              onClick={() => pick({ kind: "query", value: value.trim() })}
              className="mt-1 flex w-full items-center justify-between gap-2 rounded-[14px] px-2 py-2.5 text-sm font-bold text-ink hover:bg-surface-muted"
            >
              <span className="flex items-center gap-2">
                <Search className="size-4" /> See all results for “{value.trim()}”
              </span>
              <span className="text-xs text-muted">Enter ↵ · {data.tookMs} ms</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
SearchBar.displayName = "SearchBar";

function JumpRow({ icon, label, count, active, onHover, onClick }: { icon: React.ReactNode; label: React.ReactNode; count: number; active: boolean; onHover: () => void; onClick: () => void }) {
  return (
    <div role="option" aria-selected={active} onMouseEnter={onHover} onClick={onClick} className={cn("flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2 text-sm text-ink-2", active && "bg-surface-muted")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lavender-soft text-lavender-text [&_svg]:size-4">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted tabular">{count} chemicals</span>
      <ArrowUpLeft className="size-3.5 rotate-90 text-muted" />
    </div>
  );
}
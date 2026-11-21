import { useEffect, useRef, useState } from "react";
import { api, type SearchHit } from "./api";

interface Props {
  onResults(ids: string[]): void;
  onOpen(id: string): void;
  onCreate(path: string): void;
}

/** Search across titles and text. Results light up on the map as you type. */
export function Search({ onResults, onOpen, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      onResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .search(q)
        .then(({ hits }) => {
          setHits(hits);
          setActive(0);
          onResults(hits.map((hit) => hit.id));
        })
        .catch(() => undefined);
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const choose = (index: number) => {
    const hit = hits[index];
    if (hit) onOpen(hit.id);
    else if (query.trim()) onCreate(query.trim());
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search" onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setOpen(false)}>
      <input
        ref={input}
        type="search"
        placeholder="Search notes"
        aria-label="Search notes"
        aria-expanded={open && query.length > 0}
        aria-controls="search-results"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length));
          else if (event.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (event.key === "Enter") choose(active);
          else if (event.key === "Escape") {
            setQuery("");
            input.current?.blur();
          } else return;
          event.preventDefault();
        }}
      />
      <kbd className="hint">⌘K</kbd>
      {open && query.trim() && (
        <ul className="results" id="search-results" role="listbox">
          {hits.map((hit, index) => (
            <li key={hit.id} role="option" aria-selected={index === active}>
              <button tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)} className={index === active ? "active" : ""}>
                <strong>{hit.path}</strong>
                <span>{hit.snippet.replace(/\s+/g, " ").trim()}</span>
              </button>
            </li>
          ))}
          <li role="option" aria-selected={active === hits.length}>
            <button tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(hits.length)} className={active === hits.length ? "active" : ""}>
              <strong>Create “{query.trim()}”</strong>
              <span>Start a new note with this name</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

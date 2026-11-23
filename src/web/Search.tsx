import { useEffect, useRef, useState } from "react";
import { api, type SearchHit } from "./api";
import { Icon } from "./Icons";

interface Props {
  onResults(ids: string[]): void;
  onOpen(id: string): void;
  onCreate(path: string): void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Search across titles and text, opened with ⌘K. Results light up on the map behind the list as you type. */
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

  const showing = open && query.trim().length > 0;
  const optionId = (index: number) => `search-option-${index}`;

  return (
    <div className="search" data-open={showing || undefined} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setOpen(false)}>
      <div className="search-field">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          placeholder="Search notes or create one"
          aria-label="Search notes"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showing}
          aria-controls="search-results"
          aria-activedescendant={showing ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
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
        <kbd className="hint" aria-hidden="true">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </div>
      {showing && (
        <div className="results">
          <ul id="search-results" role="listbox" aria-label="Search results">
            {hits.length > 0 && (
              <li className="results-group" role="presentation">
                Notes
              </li>
            )}
            {hits.map((hit, index) => {
              const parts = hit.path.split("/");
              const name = parts.pop();
              return (
                <li key={hit.id} id={optionId(index)} role="option" aria-selected={index === active}>
                  <button tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(index)} className={index === active ? "active" : ""}>
                    <Icon name="note" />
                    <span className="hit">
                      <span className="hit-title">
                        <strong>{name}</strong>
                        {parts.length > 0 && <span className="hit-folder">{parts.join(" / ")}</span>}
                      </span>
                      <span className="hit-snippet">{hit.snippet.replace(/\s+/g, " ").trim()}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="results-group" role="presentation">
              Create
            </li>
            <li id={optionId(hits.length)} role="option" aria-selected={active === hits.length}>
              <button
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(hits.length)}
                onClick={() => choose(hits.length)}
                className={active === hits.length ? "active" : ""}
              >
                <Icon name="plus" />
                <span className="hit">
                  <span className="hit-title">
                    <strong>New note “{query.trim()}”</strong>
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <div className="results-foot" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move
            </span>
            <span>
              <kbd>↵</kbd> to open
            </span>
            <span>
              <kbd>esc</kbd> to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

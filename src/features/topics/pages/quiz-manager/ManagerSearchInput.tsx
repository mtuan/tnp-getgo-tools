import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export function ManagerSearchInput({
  value,
  label,
  placeholder,
}: {
  value?: string;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const rootRef = useRef<HTMLLabelElement>(null);
  const inputSequence = useRef(0);

  useEffect(() => setDraft(value ?? ""), [value]);

  const applyVisibility = useCallback((query: string, reason: "input" | "rows-changed") => {
    const startedAt = performance.now();
    const manager = rootRef.current?.closest(".manager");
    if (!manager) return;
    const normalized = query.trim().toLocaleLowerCase();
    const rows = Array.from(manager.querySelectorAll<HTMLElement>("[data-manager-search-row]"));
    let visible = 0;
    let changed = 0;
    for (const row of rows) {
      const matches = !normalized || (row.dataset.managerSearchText ?? "").includes(normalized);
      if (row.hidden === matches) changed += 1;
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const empty of manager.querySelectorAll<HTMLElement>("[data-manager-search-empty]")) {
      empty.hidden = visible > 0;
    }
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.info("[GetGo Tools][Topics search][DOM visibility]", {
      sequence: inputSequence.current,
      query,
      reason,
      rowCount: rows.length,
      visibleCount: visible,
      changedCount: changed,
      durationMs,
    });
    if (reason === "input") {
      requestAnimationFrame(() => console.info("[GetGo Tools][Topics search][paint]", {
        sequence: inputSequence.current,
        query,
        inputToPaintMs: Math.round((performance.now() - startedAt) * 10) / 10,
      }));
    }
  }, []);

  useEffect(() => {
    const manager = rootRef.current?.closest(".manager");
    if (!manager) return;
    const observer = new MutationObserver(() => applyVisibility(draft, "rows-changed"));
    observer.observe(manager, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [applyVisibility, draft]);

  const update = (next: string) => {
    const sequence = ++inputSequence.current;
    console.info("[GetGo Tools][Topics search][input]", {
      sequence,
      query: next,
      queryLength: next.length,
    });
    setDraft(next);
    applyVisibility(next, "input");
  };

  return <label ref={rootRef} className="manager-search ui-page-header-control">
    <Search size={17} />
    <input
      aria-label={label}
      value={draft}
      onChange={(event) => update(event.target.value)}
      placeholder={placeholder}
    />
  </label>;
}

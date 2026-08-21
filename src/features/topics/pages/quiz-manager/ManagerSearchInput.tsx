import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export function ManagerSearchInput({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const update = (next: string) => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onChange(next);
    }, 80);
  };

  return <label className="manager-search ui-page-header-control">
    <Search size={17} />
    <input
      aria-label={label}
      value={draft}
      onChange={(event) => update(event.target.value)}
      placeholder={placeholder}
    />
  </label>;
}

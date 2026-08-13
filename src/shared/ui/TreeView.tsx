import { ChevronRight, File, FileText, Folder } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

export interface TreeViewItem {
  id: string;
  label: string;
  kind?: "collection" | "document" | "folder" | "file";
  meta?: string;
  children?: TreeViewItem[];
}

interface Props {
  ariaLabel: string;
  items: TreeViewItem[];
  selectedId: string | null;
  onSelect(id: string): void;
}

export function TreeView({ ariaLabel, items, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    offset: number | "first" | "last",
  ) => {
    const tree = event.currentTarget.closest(".ui-tree-view");
    const nodes = [...(tree?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ?? [])];
    const index = nodes.indexOf(event.currentTarget);
    const target = offset === "first"
      ? nodes[0]
      : offset === "last"
        ? nodes.at(-1)
        : nodes[index + offset];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };
  const renderItems = (nodes: TreeViewItem[], depth: number) => (
    <ul className="ui-tree-group" role={depth ? "group" : "tree"} aria-label={depth ? undefined : ariaLabel}>
      {nodes.map((item) => {
        const branch = Boolean(item.children?.length);
        const expanded = branch && !collapsed.has(item.id);
        const ItemIcon = item.kind === "document" ? FileText : item.kind === "file" ? File : Folder;
        return (
          <li key={item.id} role="none">
            <button
              type="button"
              role="treeitem"
              aria-expanded={branch ? expanded : undefined}
              aria-selected={!branch ? selectedId === item.id : undefined}
              className={selectedId === item.id ? "selected" : ""}
              style={{ paddingInlineStart: 10 + depth * 18 }}
              onClick={() => {
                if (branch)
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (expanded) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  });
                else onSelect(item.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") moveFocus(event, 1);
                else if (event.key === "ArrowUp") moveFocus(event, -1);
                else if (event.key === "Home") moveFocus(event, "first");
                else if (event.key === "End") moveFocus(event, "last");
                else if (event.key === "ArrowRight" && branch && !expanded) {
                  event.preventDefault();
                  setCollapsed((current) => {
                    const next = new Set(current);
                    next.delete(item.id);
                    return next;
                  });
                } else if (event.key === "ArrowLeft" && branch && expanded) {
                  event.preventDefault();
                  setCollapsed((current) => new Set([...current, item.id]));
                }
              }}
            >
              {branch ? <ChevronRight className="ui-tree-chevron" aria-hidden="true" /> : <span className="ui-tree-chevron" />}
              <ItemIcon aria-hidden="true" />
              <span>{item.label}</span>
              {item.meta && <small>{item.meta}</small>}
            </button>
            {branch && expanded ? renderItems(item.children ?? [], depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );
  return <nav className="ui-tree-view">{renderItems(items, 0)}</nav>;
}

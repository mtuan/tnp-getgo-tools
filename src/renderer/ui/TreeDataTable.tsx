import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { DataTableCells, DataTableColumns, DataTableHeader, type DataColumn } from "./DataTable";

export interface TreeDataRow<T> {
  row: T;
  children?: TreeDataRow<T>[];
}

export function TreeDataTable<T>({ rows, columns, rowKey, ariaLabel, emptyText = "No rows yet.", onRowClick, toggleParentOnRowClick = false, renderIdentity }: {
  rows: TreeDataRow<T>[];
  columns: DataColumn<T>[];
  rowKey(row: T): string;
  ariaLabel: string;
  emptyText?: string;
  onRowClick?(row: T): void;
  toggleParentOnRowClick?: boolean;
  renderIdentity?(row: T, depth: number, toggle: ReactNode): ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const renderRows = (items: TreeDataRow<T>[], depth: number): ReactNode => items.map((item, index) => {
    const key = rowKey(item.row);
    const branch = Boolean(item.children?.length);
    const expanded = branch && !collapsed.has(key);
    const toggle = branch ? <button type="button" className="ui-tree-data-toggle" aria-label={expanded ? "Collapse row" : "Expand row"} aria-expanded={expanded} onClick={(event) => {
      event.stopPropagation();
      setCollapsed((current) => { const next = new Set(current); if (expanded) next.add(key); else next.delete(key); return next; });
    }}><ChevronRight className={expanded ? "expanded" : ""} /></button> : <span className="ui-tree-data-toggle-spacer" />;
    const effectiveColumns = renderIdentity ? columns.map((column, columnIndex) => columnIndex === 0 ? { ...column, render: (row: T) => renderIdentity(row, depth, toggle) } : column) : columns;
    return <tbody className={`ui-tree-data-group ${expanded ? "open" : ""}`} key={key}>
      <tr className={[(onRowClick || (toggleParentOnRowClick && branch)) && "clickable", depth === 0 ? "ui-tree-data-parent" : "ui-tree-data-child"].filter(Boolean).join(" ")} onClick={toggleParentOnRowClick && branch ? () => setCollapsed((current) => { const next = new Set(current); if (expanded) next.add(key); else next.delete(key); return next; }) : onRowClick ? () => onRowClick(item.row) : undefined}><DataTableCells columns={effectiveColumns} row={item.row} index={index} /></tr>
      {branch && <tr className="ui-tree-data-region-row"><td colSpan={columns.length}><div className="ui-tree-data-region" aria-hidden={!expanded} inert={!expanded}><div className="ui-tree-data-region-inner"><table><DataTableColumns columns={columns} />{renderRows(item.children ?? [], depth + 1)}</table></div></div></td></tr>}
    </tbody>;
  });
  return <div className="ui-data-table ui-tree-data-table"><div className="ui-data-table-scroll"><table aria-label={ariaLabel}><DataTableColumns columns={columns} /><thead><DataTableHeader columns={columns} /></thead>{renderRows(rows, 0)}{!rows.length && <tbody><tr><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr></tbody>}</table></div></div>;
}

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { DataTableCells, DataTableColumns, DataTableHeader, type DataColumn } from "./DataTable";

export interface TreeDataRow<T> {
  row: T;
  children?: TreeDataRow<T>[];
  hasChildren?: boolean;
}

export function TreeDataTable<T>({ rows, columns, rowKey, rowSearchText, ariaLabel, emptyText = "No rows yet.", onRowClick, toggleParentOnRowClick = false, singleExpand = false, defaultExpandedKeys = [], horizontalScroll = false, onExpand, renderIdentity }: {
  rows: TreeDataRow<T>[];
  columns: DataColumn<T>[];
  rowKey(row: T): string;
  rowSearchText?(row: T): string;
  ariaLabel: string;
  emptyText?: string;
  onRowClick?(row: T): void;
  toggleParentOnRowClick?: boolean;
  /** Keep only one branch expanded at a time. */
  singleExpand?: boolean;
  /** Rows expanded when the table is first mounted. */
  defaultExpandedKeys?: string[];
  horizontalScroll?: boolean;
  onExpand?(row: T): Promise<void> | void;
  renderIdentity?(row: T, depth: number, toggle: ReactNode): ReactNode;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(defaultExpandedKeys),
  );
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  const toggleRow = async (item: TreeDataRow<T>, key: string) => {
    if (expandedKeys.has(key)) {
      setExpandedKeys((current) => { const next = new Set(current); next.delete(key); return next; });
      return;
    }
    setExpandedKeys((current) =>
      singleExpand ? new Set([key]) : new Set(current).add(key),
    );
    if (!item.children && onExpand) {
      setLoadingKeys((current) => new Set(current).add(key));
      try { await onExpand(item.row); }
      catch (error) {
        console.error("[TreeDataTable] Failed to load child rows", { key, error });
        setExpandedKeys((current) => { const next = new Set(current); next.delete(key); return next; });
      }
      finally { setLoadingKeys((current) => { const next = new Set(current); next.delete(key); return next; }); }
    }
  };
  const renderRows = (items: TreeDataRow<T>[], depth: number): ReactNode => items.flatMap((item, index) => {
    const key = rowKey(item.row);
    const branch = item.hasChildren ?? Boolean(item.children?.length);
    const expanded = branch && expandedKeys.has(key);
    const loading = loadingKeys.has(key);
    const toggle = branch ? <button type="button" className="ui-tree-data-toggle" aria-label={expanded ? "Collapse row" : "Expand row"} aria-expanded={expanded} onClick={(event) => {
      event.stopPropagation();
      void toggleRow(item, key);
    }}><ChevronRight className={expanded ? "expanded" : ""} /></button> : <span className="ui-tree-data-toggle-spacer" />;
    const effectiveColumns = renderIdentity ? columns.map((column, columnIndex) => columnIndex === 0 ? { ...column, render: (row: T) => renderIdentity(row, depth, toggle) } : column) : columns;
    const row = <tr key={key} data-manager-search-row={rowSearchText ? "true" : undefined} data-manager-search-text={rowSearchText?.(item.row).toLocaleLowerCase()} className={[(onRowClick || (toggleParentOnRowClick && branch)) && "clickable", depth === 0 ? "ui-tree-data-parent" : "ui-tree-data-child"].filter(Boolean).join(" ")} onClick={toggleParentOnRowClick && branch ? () => void toggleRow(item, key) : onRowClick ? () => onRowClick(item.row) : undefined}><DataTableCells columns={effectiveColumns} row={item.row} index={index} /></tr>;
    if (!expanded) return [row];
    if (loading) return [row, <tr className="ui-tree-data-loading-row" key={`${key}:loading`}><td colSpan={columns.length}><div className="ui-tree-data-loading"><span className="mini-spinner" />Loading quizzes…</div></td></tr>];
    return [row, ...([] as ReactNode[]).concat(renderRows(item.children ?? [], depth + 1) as ReactNode)];
  });
  return <div className={`ui-data-table ui-tree-data-table ${horizontalScroll ? "ui-data-table-horizontal" : ""}`}><div className="ui-data-table-scroll"><table aria-label={ariaLabel}><DataTableColumns columns={columns} /><thead><DataTableHeader columns={columns} /></thead><tbody>{renderRows(rows, 0)}{!rows.length && <tr><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}{rows.length > 0 && rowSearchText && <tr data-manager-search-empty hidden><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}</tbody></table></div></div>;
}

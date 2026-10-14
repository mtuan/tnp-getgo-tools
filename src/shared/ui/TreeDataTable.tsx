import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { DataTableCells, DataTableColumns, type DataColumn } from "./DataTable";

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
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(defaultExpandedKeys),
  );
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  const displayedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    const sortLevel = (items: TreeDataRow<T>[]): TreeDataRow<T>[] => items
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftValue = column.sortValue!(left.item.row);
        const rightValue = column.sortValue!(right.item.row);
        const comparison = typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : collator.compare(String(leftValue), String(rightValue));
        return (comparison || left.index - right.index) * (sort.direction === "asc" ? 1 : -1);
      })
      .map(({ item }) => ({ ...item, children: item.children ? sortLevel(item.children) : undefined }));
    return sortLevel(rows);
  }, [columns, rows, sort]);
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
  return <div className={`ui-data-table ui-tree-data-table ${horizontalScroll ? "ui-data-table-horizontal" : ""}`}><div className="ui-data-table-scroll"><table aria-label={ariaLabel}><DataTableColumns columns={columns} /><thead><tr>{columns.map((column) => <th className={column.className} style={{ width: column.width, textAlign: column.align }} key={column.key}>{column.sortValue ? <button type="button" className="ui-data-table-sort" aria-label={`Sort by ${String(column.title)}`} aria-pressed={sort?.key === column.key} onClick={() => setSort((current) => current?.key === column.key ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" } : { key: column.key, direction: "asc" })}><span>{column.title}</span>{sort?.key === column.key ? sort.direction === "asc" ? <ArrowUp /> : <ArrowDown /> : <ArrowUpDown />}</button> : column.title}</th>)}</tr></thead><tbody>{renderRows(displayedRows, 0)}{!rows.length && <tr><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}{rows.length > 0 && rowSearchText && <tr data-manager-search-empty hidden><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}</tbody></table></div></div>;
}

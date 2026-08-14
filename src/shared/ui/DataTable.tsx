import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface DataColumn<T> {
  key: string;
  title: ReactNode;
  width?: string | number;
  align?: "left" | "center" | "right";
  className?: string;
  role?: "actions";
  render(row: T, index: number): ReactNode;
  sortValue?(row: T): string | number;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey(row: T, index: number): string;
  ariaLabel: string;
  emptyText?: string;
  footer?: ReactNode;
  onRowClick?(row: T, index: number): void;
  onRowMove?(fromIndex: number, toIndex: number): void;
  selectedRowIndex?: number;
  selectedRowKey?: string;
  defaultSort?: { key: string; direction?: "asc" | "desc" };
  sortLocale?: string;
  horizontalScroll?: boolean;
}

function columnClassName<T>(column: DataColumn<T>): string | undefined {
  return [column.role === "actions" && "ui-data-table-actions-column", column.className]
    .filter(Boolean)
    .join(" ") || undefined;
}

export function DataTableHeader<T>({ columns }: { columns: DataColumn<T>[] }) {
  return <tr>{columns.map((column) => <th className={columnClassName(column)} style={{ width: column.width, textAlign: column.align }} key={column.key}>{column.title}</th>)}</tr>;
}

export function DataTableColumns<T>({ columns }: { columns: DataColumn<T>[] }) {
  return <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>;
}

export function DataTableCells<T>({ columns, row, index }: { columns: DataColumn<T>[]; row: T; index: number }) {
  return <>{columns.map((column) => <td className={columnClassName(column)} style={{ textAlign: column.align }} key={column.key}>{column.render(row, index)}</td>)}</>;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  ariaLabel,
  emptyText = "No rows yet.",
  footer,
  onRowClick,
  onRowMove,
  selectedRowIndex,
  selectedRowKey,
  defaultSort,
  sortLocale,
  horizontalScroll = false,
}: DataTableProps<T>) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [sort, setSort] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(() => defaultSort
    ? { key: defaultSort.key, direction: defaultSort.direction ?? "asc" }
    : null);
  const displayedRows = useMemo(() => {
    if (!sort || onRowMove) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const collator = new Intl.Collator(sortLocale, {
      sensitivity: "base",
      numeric: true,
    });
    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftValue = column.sortValue!(left.row);
        const rightValue = column.sortValue!(right.row);
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : collator.compare(String(leftValue), String(rightValue));
        return (comparison || left.index - right.index) * (sort.direction === "asc" ? 1 : -1);
      })
      .map((item) => item.row);
  }, [columns, onRowMove, rows, sort, sortLocale]);
  return (
    <div className={`ui-data-table ${horizontalScroll ? "ui-data-table-horizontal" : ""}`}>
      <div className="ui-data-table-scroll">
        <table aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  className={columnClassName(column)}
                  style={{ width: column.width, textAlign: column.align }}
                  key={column.key}
                >
                  {column.sortValue && !onRowMove ? (
                    <button
                      type="button"
                      className="ui-data-table-sort"
                      aria-label={`Sort by ${String(column.title)}`}
                      aria-pressed={sort?.key === column.key}
                      onClick={() => setSort((current) =>
                        current?.key === column.key
                          ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
                          : { key: column.key, direction: "asc" },
                      )}
                    >
                      <span>{column.title}</span>
                      {sort?.key === column.key
                        ? sort.direction === "asc" ? <ArrowUp /> : <ArrowDown />
                        : <ArrowUpDown />}
                    </button>
                  ) : column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row, index) => {
              const currentRowKey = rowKey(row, index);
              return (
                <tr
                  draggable={Boolean(onRowMove)}
                  className={[
                    onRowClick && "clickable",
                    onRowMove && "reorderable",
                    (selectedRowKey !== undefined
                      ? selectedRowKey === currentRowKey
                      : selectedRowIndex === index) && "is-selected",
                    dragging === index && "dragging",
                    dragOver === index && dragging !== index && "drag-over",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  onDragStart={
                    onRowMove
                      ? (event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(index);
                        }
                      : undefined
                  }
                  onDragOver={
                    onRowMove
                      ? (event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOver(index);
                        }
                      : undefined
                  }
                  onDrop={
                    onRowMove
                      ? (event) => {
                          event.preventDefault();
                          if (dragging !== null && dragging !== index)
                            onRowMove(dragging, index);
                          setDragging(null);
                          setDragOver(null);
                        }
                      : undefined
                  }
                  onDragEnd={
                    onRowMove
                      ? () => {
                          setDragging(null);
                          setDragOver(null);
                        }
                      : undefined
                  }
                  key={currentRowKey}
                >
                  {columns.map((column) => (
                    <td className={columnClassName(column)} style={{ textAlign: column.align }} key={column.key}>
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td className="ui-data-table-empty" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

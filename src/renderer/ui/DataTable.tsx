import { useState, type ReactNode } from "react"

export interface DataColumn<T> {
  key: string
  title: ReactNode
  width?: string | number
  align?: "left" | "center" | "right"
  render(row: T, index: number): ReactNode
}

export interface DataTableProps<T> {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey(row: T, index: number): string
  ariaLabel: string
  emptyText?: string
  footer?: ReactNode
  onRowClick?(row: T, index: number): void
  onRowMove?(fromIndex: number, toIndex: number): void
}

export function DataTable<T>({ rows, columns, rowKey, ariaLabel, emptyText = "No rows yet.", footer, onRowClick, onRowMove }: DataTableProps<T>) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  return <div className="ui-data-table"><div className="ui-data-table-scroll"><table aria-label={ariaLabel}><thead><tr>{columns.map(column => <th style={{ width: column.width, textAlign: column.align }} key={column.key}>{column.title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr draggable={Boolean(onRowMove)} className={[onRowClick && "clickable", onRowMove && "reorderable", dragging === index && "dragging", dragOver === index && dragging !== index && "drag-over"].filter(Boolean).join(" ")} onClick={onRowClick ? () => onRowClick(row, index) : undefined} onDragStart={onRowMove ? event => { event.dataTransfer.effectAllowed = "move"; setDragging(index) } : undefined} onDragOver={onRowMove ? event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver(index) } : undefined} onDrop={onRowMove ? event => { event.preventDefault(); if (dragging !== null && dragging !== index) onRowMove(dragging, index); setDragging(null); setDragOver(null) } : undefined} onDragEnd={onRowMove ? () => { setDragging(null); setDragOver(null) } : undefined} key={rowKey(row, index)}>{columns.map(column => <td style={{ textAlign: column.align }} key={column.key}>{column.render(row, index)}</td>)}</tr>)}{!rows.length && <tr><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}</tbody></table></div>{footer}</div>
}

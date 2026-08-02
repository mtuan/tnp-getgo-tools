import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { FormControl, type FormField, type FormValues } from "./Form"

export interface EditColumnDef<T extends object> {
  key: string
  dataKey: keyof T
  title: ReactNode
  width?: CSSProperties["width"]
  field: FormField
  renderView?: (value: unknown, row: T) => ReactNode
}

export interface EditTableProps<T extends object> {
  columns: EditColumnDef<T>[]
  rows: T[]
  rowKey?: keyof T | ((row: T, index: number) => string)
  onRowChange(index: number, field: keyof T, value: unknown): void
  onRowAdd?(): void
  onRowDelete?(index: number): void
  /** Enables drag handles and keyboard reordering. */
  reorderable?: boolean
  /** Receives the complete reordered row array. */
  onRowsReorder?(rows: T[]): void
  addLabel?: string
  emptyText?: string
  ariaLabel: string
  autoFocusOnAdd?: boolean
}

export function EditTable<T extends object>({ columns, rows, rowKey, onRowChange, onRowAdd, onRowDelete, reorderable = false, onRowsReorder, addLabel = "Add row", emptyText = "No rows yet.", ariaLabel, autoFocusOnAdd = true }: EditTableProps<T>) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const focusAddedRow = useRef(false)
  const previousRowCount = useRef(rows.length)
  useLayoutEffect(() => {
    if (focusAddedRow.current && rows.length > previousRowCount.current) {
      const selector = "tbody tr:last-child td:not(.edit-table-reorder):not(.edit-table-actions) input:not(:disabled), tbody tr:last-child td:not(.edit-table-reorder):not(.edit-table-actions) textarea:not(:disabled), tbody tr:last-child td:not(.edit-table-reorder):not(.edit-table-actions) button:not(:disabled)"
      rootRef.current?.querySelector<HTMLElement>(selector)?.focus()
      focusAddedRow.current = false
    }
    previousRowCount.current = rows.length
  }, [rows.length])
  const keyFor = (row: T, index: number) => typeof rowKey === "function" ? rowKey(row, index) : rowKey ? String(row[rowKey]) : String(index)
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return
    const reordered = [...rows]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onRowsReorder?.(reordered)
  }
  return <div className="edit-table" ref={rootRef}>
    <div className="edit-table-scroll"><table aria-label={ariaLabel}>
      <thead><tr>{reorderable && <th className="edit-table-reorder"><span className="sr-only">Reorder</span></th>}{columns.map(column => <th style={{ width: column.width }} key={column.key}>{column.title}</th>)}{onRowDelete && <th className="edit-table-actions"><span className="sr-only">Actions</span></th>}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => {
        const values = row as FormValues
        return <tr className={`${dragging === rowIndex ? "dragging" : ""} ${dragOver === rowIndex ? "drag-over" : ""}`} onDragOver={event => { if (!reorderable || dragging === null) return; event.preventDefault(); setDragOver(rowIndex) }} onDrop={event => { event.preventDefault(); if (dragging !== null) move(dragging, rowIndex); setDragging(null); setDragOver(null) }} key={keyFor(row, rowIndex)}>{reorderable && <td className="edit-table-reorder"><button type="button" draggable aria-label={`Reorder row ${rowIndex + 1}. Use arrow keys or drag.`} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; setDragging(rowIndex) }} onDragEnd={() => { setDragging(null); setDragOver(null) }} onKeyDown={event => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); move(rowIndex, rowIndex + (event.key === "ArrowUp" ? -1 : 1)) }}><GripVertical /></button></td>}{columns.map(column => <td key={column.key}>{column.renderView ? column.renderView(row[column.dataKey], row) : <FormControl field={{ ...column.field, name: String(column.dataKey), label: undefined }} values={values} onChange={(_name, value) => onRowChange(rowIndex, column.dataKey, value)} />}</td>)}{onRowDelete && <td className="edit-table-actions"><button type="button" onClick={() => onRowDelete(rowIndex)} aria-label={`Remove row ${rowIndex + 1}`}><Trash2 /></button></td>}</tr>
      })}{!rows.length && <tr><td className="edit-table-empty" colSpan={columns.length + (onRowDelete ? 1 : 0) + (reorderable ? 1 : 0)}>{emptyText}</td></tr>}</tbody>
    </table></div>
    {onRowAdd && <button type="button" className="edit-table-add" onClick={() => { focusAddedRow.current = autoFocusOnAdd; onRowAdd() }}><Plus />{addLabel}</button>}
  </div>
}

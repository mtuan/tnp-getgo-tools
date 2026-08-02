import type { ReactNode } from "react"

export interface DataColumn<T> {
  key: string
  title: ReactNode
  width?: string | number
  render(row: T, index: number): ReactNode
}

export interface DataTableProps<T> {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey(row: T, index: number): string
  ariaLabel: string
  emptyText?: string
  footer?: ReactNode
}

export function DataTable<T>({ rows, columns, rowKey, ariaLabel, emptyText = "No rows yet.", footer }: DataTableProps<T>) {
  return <div className="ui-data-table"><div className="ui-data-table-scroll"><table aria-label={ariaLabel}><thead><tr>{columns.map(column => <th style={{ width: column.width }} key={column.key}>{column.title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey(row, index)}>{columns.map(column => <td key={column.key}>{column.render(row, index)}</td>)}</tr>)}{!rows.length && <tr><td className="ui-data-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}</tbody></table></div>{footer}</div>
}

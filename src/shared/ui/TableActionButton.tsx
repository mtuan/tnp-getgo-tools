import { forwardRef } from "react"
import { Button, type ButtonProps } from "./Button"

export type TableActionButtonProps = ButtonProps

export const TableActionButton = forwardRef<HTMLButtonElement, TableActionButtonProps>(function TableActionButton({ variant = "solid", className = "", ...props }, ref) {
  return <Button ref={ref} variant={variant} className={`ui-table-action-button ${className}`.trim()} {...props} />
})

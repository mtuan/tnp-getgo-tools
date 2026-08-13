import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"

export type ButtonVariant = "solid" | "outline" | "primary" | "secondary" | "danger" | "text" | "icon"
export type ButtonColor = "primary" | "danger" | "success" | "warning" | "neutral"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  color?: ButtonColor
  icon?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "outline", color = "primary", icon, loading = false, className = "", type = "button", disabled, children, ...props }, ref) {
  const variantClass = variant === "solid" ? "primary" : variant === "outline" ? "secondary" : variant === "text" ? "text-button" : variant === "icon" ? "icon-button" : variant
  const spinner = <span className="ui-button-spinner" aria-hidden="true" />
  return <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`ui-button ${variantClass} button-color-${color} ${loading ? "is-loading" : ""} ${disabled && !loading ? "is-disabled" : ""} ${className}`.trim()} {...props}>
    {icon ? <span className="ui-button-icon" aria-hidden="true">{loading ? spinner : icon}</span> : loading ? <span className="ui-button-loading-overlay">{spinner}</span> : null}
    {children !== undefined && children !== null && <span className="ui-button-content">{children}</span>}
  </button>
})

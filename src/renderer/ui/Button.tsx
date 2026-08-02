import { forwardRef, type ButtonHTMLAttributes } from "react"

export type ButtonVariant = "solid" | "outline" | "primary" | "secondary" | "danger" | "text" | "icon"
export type ButtonColor = "primary" | "danger" | "success" | "warning" | "neutral"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  color?: ButtonColor
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "outline", color = "primary", className = "", type = "button", ...props }, ref) {
  const variantClass = variant === "solid" ? "primary" : variant === "outline" ? "secondary" : variant === "text" ? "text-button" : variant === "icon" ? "icon-button" : variant
  return <button ref={ref} type={type} className={`ui-button ${variantClass} button-color-${color} ${className}`.trim()} {...props} />
})

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react"

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ leftIcon, rightIcon, className = "", ...props }, ref) {
  return <div className={`ui-input ${leftIcon ? "has-left-icon" : ""} ${rightIcon ? "has-right-icon" : ""} ${className}`.trim()}>
    {leftIcon && <span className="ui-input-left" aria-hidden="true">{leftIcon}</span>}
    <input ref={ref} {...props} />
    {rightIcon && <span className="ui-input-right" aria-hidden="true">{rightIcon}</span>}
  </div>
})

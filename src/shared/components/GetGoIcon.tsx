import { forwardRef } from "react"

interface GetGoIconProps {
  size?: number
  className?: string
}

// Mirrors the canonical GetGoIcon component from tnp-getgo-web.
export const GetGoIcon = forwardRef<HTMLImageElement, GetGoIconProps>(({ size = 24, className = "" }, ref) => (
  <img
    ref={ref}
    src="./icons/getgo-icon-blue.png"
    alt="GetGo"
    width={size}
    height={size}
    className={className}
  />
))

GetGoIcon.displayName = "GetGoIcon"

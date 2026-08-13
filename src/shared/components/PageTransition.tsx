import { useEffect, useRef, useState, type ReactNode } from "react"

interface PageTransitionProps {
  children: ReactNode
  trigger?: unknown[]
  duration?: number
  className?: string
}

// Adapted from tnp-getgo-web's shared PageTransition component.
export function PageTransition({ children, trigger = [], duration = 200, className = "" }: PageTransitionProps) {
  const [visible, setVisible] = useState(true)
  const initialRender = useRef(true)
  const triggerKey = JSON.stringify(trigger)

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return
    }
    queueMicrotask(() => setVisible(false))
    const timer = window.setTimeout(() => setVisible(true), Math.max(50, duration / 4))
    return () => window.clearTimeout(timer)
  }, [triggerKey, duration])

  return <div className={`page-transition ${visible ? "visible" : "hidden"} ${className}`} style={{ transitionDuration: `${duration}ms` }}>{children}</div>
}

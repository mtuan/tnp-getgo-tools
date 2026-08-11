import { useEffect, useRef } from "react"

const activeSaveScopes: symbol[] = []

export function useSaveShortcut({ active = true, enabled, onSave }: {
  active?: boolean
  enabled: boolean
  onSave(): void
}) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  useEffect(() => {
    if (!active) return
    const scope = Symbol("save-shortcut")
    activeSaveScopes.push(scope)
    const keyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s" || activeSaveScopes.at(-1) !== scope) return
      event.preventDefault()
      if (enabled) saveRef.current()
    }
    window.addEventListener("keydown", keyDown)
    return () => {
      window.removeEventListener("keydown", keyDown)
      const index = activeSaveScopes.indexOf(scope)
      if (index >= 0) activeSaveScopes.splice(index, 1)
    }
  }, [active, enabled])
}

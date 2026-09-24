import { useSyncExternalStore } from "react"

const darkModeQuery = "(prefers-color-scheme: dark)"

const subscribe = (onStoreChange: () => void) => {
  const media = window.matchMedia(darkModeQuery)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

const getSnapshot = () => window.matchMedia(darkModeQuery).matches

/** Keeps JavaScript-rendered surfaces in sync when the operating-system theme changes. */
export function useSystemDarkMode() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

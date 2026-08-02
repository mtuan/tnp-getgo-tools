import type { DesktopApi } from "./core/models"

declare global { interface Window { getgo: DesktopApi } }
export {}

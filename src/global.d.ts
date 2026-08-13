import type { DesktopApi } from "./shared/domain/models"

declare global { interface Window { getgo: DesktopApi } }
export {}

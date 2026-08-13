import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "../app/renderer/App"
import "./styles.css"
import { ToastProvider } from "../shared/ui/Toast"
import { AuthProvider } from "../features/authentication/components/AuthContext"

createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></StrictMode>)

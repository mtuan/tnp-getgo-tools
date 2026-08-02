import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles.css"
import { ToastProvider } from "./ui/Toast"
import { AuthProvider } from "./AuthContext"

createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></StrictMode>)

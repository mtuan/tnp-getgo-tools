import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { AuthState } from "../../../shared/domain/models"
import { AuthDialog } from "./AuthDialog"
import { useToast } from "../../../shared/ui/Toast"

interface AuthApi {
  state: AuthState
  loading: boolean
  requestLogin(): void
  refresh(): Promise<void>
  signOut(): Promise<void>
  requireAuth(action: () => void | Promise<void>): void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [state, setState] = useState<AuthState>({ user: null })
  const [loading, setLoading] = useState(true)
  const [loginOpen, setLoginOpen] = useState(false)
  const pendingAction = useRef<(() => void | Promise<void>) | null>(null)

  useEffect(() => { void window.getgo.getAuthState().then(setState).finally(() => setLoading(false)) }, [])
  const requestLogin = useCallback(() => { pendingAction.current = null; setLoginOpen(true) }, [])
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setState(await window.getgo.getAuthState()) }
    finally { setLoading(false) }
  }, [])
  const requireAuth = useCallback((action: () => void | Promise<void>) => {
    if (state.user) { void action(); return }
    pendingAction.current = action
    setLoginOpen(true)
  }, [state.user])
  const signOut = useCallback(async () => {
    setState(await window.getgo.signOut())
    toast.show({ title: "Signed out", description: "The Firebase session was removed from this device.", variant: "info" })
  }, [toast])
  const value = useMemo(() => ({ state, loading, requestLogin, refresh, signOut, requireAuth }), [state, loading, requestLogin, refresh, signOut, requireAuth])

  return <AuthContext.Provider value={value}>{children}{loginOpen && <AuthDialog onClose={() => { pendingAction.current = null; setLoginOpen(false) }} onSignedIn={next => {
    setState(next); setLoginOpen(false)
    toast.show({ title: "Signed in", description: `Connected as ${next.user?.email}.` })
    const action = pendingAction.current; pendingAction.current = null
    if (action) void action()
  }} />}</AuthContext.Provider>
}

export function useAuth(): AuthApi {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}

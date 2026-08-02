import { useState, type FormEvent } from "react"
import { LogIn } from "lucide-react"
import type { AuthState } from "../core/models"
import { DialogFrame } from "./CrudDialogs"
import { Button } from "./ui/Button"

export function AuthDialog({ onClose, onSignedIn }: { onClose(): void; onSignedIn(state: AuthState): void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try { onSignedIn(await window.getgo.signIn(email.trim(), password)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) }
  }
  async function signInWithProvider(provider: "google" | "facebook" | "apple") {
    setBusy(true); setError(null)
    try { onSignedIn(await window.getgo.signInWithProvider(provider)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) }
  }
  return <DialogFrame presentation="modal" className="auth-dialog" hideFooter title="Sign in to GetGo" busy={busy} error={error} onClose={onClose} onSubmit={submit}>
    <div className="auth-intro"><LogIn /><div><strong>Connect your Firebase account</strong><span>Use your GetGo admin account for AI assistance, Firestore status, and publishing.</span></div></div>
    <div className="auth-divider"><span>Sign in with</span></div>
    <div className="auth-providers">
      <button type="button" disabled={busy} onClick={() => void signInWithProvider("google")}><i className="provider-google">G</i><span>Continue with Google</span></button>
      <button type="button" disabled={busy} onClick={() => void signInWithProvider("facebook")}><i className="provider-facebook">f</i><span>Continue with Facebook</span></button>
      <button type="button" disabled={busy} onClick={() => void signInWithProvider("apple")}><i className="provider-apple">●</i><span>Continue with Apple ID</span></button>
    </div>
    <div className="auth-divider"><span>or use email</span></div>
    <label>Email<input autoFocus type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
    <Button variant="solid" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in with email"}</Button>
    <p className="form-note">Your password is sent directly to Firebase Authentication and is never stored. The session token is encrypted using this device’s secure credential store.</p>
  </DialogFrame>
}

import { safeStorage, shell } from "electron"
import { promises as fs } from "node:fs"
import { createHash, randomBytes } from "node:crypto"
import http from "node:http"
import path from "node:path"
import type { AuthState, AuthUser, DynamicQuestionProposalResult } from "../core/models.js"

const apiKey = "AIzaSyDsJpKpfdXPYSySUA61oqQnIgY7p_BzspU"
const projectId = "tnp-getgo"
type Session = { refreshToken: string; idToken: string; expiresAt: number; user: AuthUser }

function firebaseError(payload: unknown): Error {
  const code = (payload as { error?: { message?: string } })?.error?.message ?? "Firebase request failed"
  const messages: Record<string, string> = {
    INVALID_LOGIN_CREDENTIALS: "The email or password is incorrect.", EMAIL_NOT_FOUND: "The email or password is incorrect.",
    INVALID_PASSWORD: "The email or password is incorrect.", USER_DISABLED: "This account has been disabled.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later.",
  }
  return new Error(messages[code] ?? code.replaceAll("_", " ").toLowerCase())
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || (payload && typeof payload === "object" && "error" in payload)) throw firebaseError(payload)
  return payload
}

export class FirebaseAuthService {
  private session: Session | null = null
  private readonly filePath: string
  constructor(userDataPath: string) { this.filePath = path.join(userDataPath, "firebase-session.bin") }

  private async persist(refreshToken: string | null) {
    if (!refreshToken) { await fs.rm(this.filePath, { force: true }); return }
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is not available on this device.")
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, safeStorage.encryptString(refreshToken), { mode: 0o600 })
  }
  private async savedRefreshToken() {
    try { return safeStorage.decryptString(await fs.readFile(this.filePath)) } catch { return null }
  }
  private userFromResponse(value: Record<string, unknown>): AuthUser {
    return { uid: String(value.localId ?? value.user_id ?? ""), email: String(value.email ?? ""), displayName: value.displayName ? String(value.displayName) : null, emailVerified: Boolean(value.emailVerified) }
  }
  private async lookup(idToken: string): Promise<AuthUser> {
    const result = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { idToken }) as { users?: Array<Record<string, unknown>> }
    if (!result.users?.[0]) throw new Error("Firebase account could not be loaded.")
    return this.userFromResponse(result.users[0])
  }
  private async refresh(refreshToken: string): Promise<Session> {
    const result = await postJson(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, { grant_type: "refresh_token", refresh_token: refreshToken }) as Record<string, unknown>
    const idToken = String(result.id_token)
    const nextRefreshToken = String(result.refresh_token)
    const user = await this.lookup(idToken)
    this.session = { idToken, refreshToken: nextRefreshToken, expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000, user }
    await this.persist(nextRefreshToken)
    return this.session
  }
  private async activeSession() {
    if (this.session && this.session.expiresAt > Date.now() + 60_000) return this.session
    const refreshToken = this.session?.refreshToken ?? await this.savedRefreshToken()
    if (!refreshToken) return null
    try { return await this.refresh(refreshToken) } catch { this.session = null; await this.persist(null); return null }
  }
  async state(): Promise<AuthState> { return { user: (await this.activeSession())?.user ?? null } }
  async signIn(email: string, password: string): Promise<AuthState> {
    const result = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, { email, password, returnSecureToken: true }) as Record<string, unknown>
    const user = this.userFromResponse(result)
    this.session = { user, idToken: String(result.idToken), refreshToken: String(result.refreshToken), expiresAt: Date.now() + Number(result.expiresIn ?? 3600) * 1000 }
    await this.persist(this.session.refreshToken)
    return { user }
  }
  async signInWithProvider(provider: "google" | "facebook" | "apple"): Promise<AuthState> {
    if (provider === "apple") throw new Error("Apple ID requires a signed macOS build with the Sign in with Apple entitlement. Configure the Apple Service ID in Settings, then package and sign the app.")
    const clientId = provider === "google" ? process.env.GETGO_GOOGLE_DESKTOP_CLIENT_ID?.trim() : process.env.GETGO_FACEBOOK_APP_ID?.trim()
    if (!clientId) throw new Error(`Configure the ${provider === "google" ? "Google Desktop client ID" : "Facebook App ID"} in Settings first.`)
    const state = randomBytes(24).toString("hex")
    let complete!: (params: URLSearchParams) => void
    let fail!: (error: Error) => void
    const callbackResult = new Promise<URLSearchParams>((resolve, reject) => { complete = resolve; fail = reject })
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      if (request.method === "POST" && url.pathname === "/complete") { let body = ""; request.setEncoding("utf8"); request.on("data", chunk => { body += chunk }); request.on("end", () => { response.writeHead(200, { "content-type": "text/html" }).end("<h2>Signed in to GetGo Tools</h2><p>You can close this window.</p>"); complete(new URLSearchParams(body)) }); return }
      if (request.method === "GET" && url.pathname === "/callback") {
        if (url.searchParams.has("code") || url.searchParams.has("error")) { response.writeHead(200, { "content-type": "text/html" }).end("<h2>Signed in to GetGo Tools</h2><p>You can close this window.</p>"); complete(url.searchParams); return }
        response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end("<!doctype html><meta charset=utf-8><title>GetGo Tools</title><p>Completing sign-in…</p><script>fetch('/complete',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(location.hash.slice(1))}).then(()=>document.body.innerHTML='<h2>Signed in to GetGo Tools</h2><p>You can close this window.</p>')</script>"); return
      }
      response.writeHead(404).end()
    })
    server.on("error", fail)
    await new Promise<void>((resolve, reject) => server.listen(provider === "facebook" ? 53682 : 0, "127.0.0.1", resolve).once("error", reject))
    const address = server.address(); if (!address || typeof address === "string") { server.close(); throw new Error("Could not start the OAuth callback.") }
    const redirectUri = `http://localhost:${address.port}/callback`
    const timeout = setTimeout(() => fail(new Error("Sign-in timed out.")), 5 * 60_000)
    try {
      let providerToken: string
      if (provider === "google") {
        const clientSecret = process.env.GETGO_GOOGLE_DESKTOP_CLIENT_SECRET?.trim()
        if (!clientSecret) throw new Error("Google sign-in is not configured in this build. The application developer must provide its Desktop OAuth credentials.")
        const verifier = randomBytes(48).toString("base64url")
        const challenge = createHash("sha256").update(verifier).digest("base64url")
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
        authUrl.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString()
        await shell.openExternal(authUrl.toString())
        const params = await callbackResult
        if (params.get("state") !== state) throw new Error("OAuth state validation failed.")
        if (!params.get("code")) throw new Error(params.get("error_description") ?? "Google sign-in was cancelled.")
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: params.get("code")!, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }) })
        const tokens = await tokenResponse.json() as { id_token?: string; error_description?: string }
        if (!tokenResponse.ok || !tokens.id_token) throw new Error(tokens.error_description ?? "Google token exchange failed.")
        providerToken = `id_token=${encodeURIComponent(tokens.id_token)}`
      } else {
        const authUrl = new URL("https://www.facebook.com/v23.0/dialog/oauth")
        authUrl.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "token", scope: "email,public_profile", state }).toString()
        await shell.openExternal(authUrl.toString())
        const params = await callbackResult
        if (params.get("state") !== state) throw new Error("OAuth state validation failed.")
        if (!params.get("access_token")) throw new Error(params.get("error_description") ?? "Facebook sign-in was cancelled.")
        providerToken = `access_token=${encodeURIComponent(params.get("access_token")!)}`
      }
      const providerId = `${provider}.com`
      const result = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, { requestUri: redirectUri, postBody: `${providerToken}&providerId=${providerId}`, returnSecureToken: true }) as Record<string, unknown>
      const user = this.userFromResponse(result)
      this.session = { user, idToken: String(result.idToken), refreshToken: String(result.refreshToken), expiresAt: Date.now() + Number(result.expiresIn ?? 3600) * 1000 }
      await this.persist(this.session.refreshToken)
      return { user }
    } finally { clearTimeout(timeout); server.close() }
  }
  async signOut(): Promise<AuthState> { this.session = null; await this.persist(null); return { user: null } }
  async changePassword(password: string): Promise<void> {
    const session = await this.activeSession()
    if (!session) throw new Error("Sign in again before changing your password.")
    const result = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, { idToken: session.idToken, password, returnSecureToken: true }) as Record<string, unknown>
    if (result.idToken && result.refreshToken) {
      this.session = { ...session, idToken: String(result.idToken), refreshToken: String(result.refreshToken), expiresAt: Date.now() + Number(result.expiresIn ?? 3600) * 1000 }
      await this.persist(this.session.refreshToken)
    }
  }
  async createProposal(input: { contestId: string; quizId: string; questionId: string; instructions?: string }): Promise<DynamicQuestionProposalResult> {
    const session = await this.activeSession()
    if (!session) throw new Error("Sign in with a GetGo admin account to use AI support.")
    const result = await postJson(`https://asia-southeast1-${projectId}.cloudfunctions.net/createGetGoDynamicQuestionProposal`, { data: input }, { authorization: `Bearer ${session.idToken}` }) as { result?: DynamicQuestionProposalResult; data?: DynamicQuestionProposalResult }
    const value = result.result ?? result.data
    if (!value?.proposal) throw new Error("The AI service returned an invalid proposal.")
    return value
  }
}

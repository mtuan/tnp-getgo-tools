import { safeStorage } from "electron"
import { promises as fs } from "node:fs"
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
  async signOut(): Promise<AuthState> { this.session = null; await this.persist(null); return { user: null } }
  async createProposal(input: { contestId: string; quizId: string; questionId: string; instructions?: string }): Promise<DynamicQuestionProposalResult> {
    const session = await this.activeSession()
    if (!session) throw new Error("Sign in with a GetGo admin account to use AI support.")
    const result = await postJson(`https://asia-southeast1-${projectId}.cloudfunctions.net/createGetGoDynamicQuestionProposal`, { data: input }, { authorization: `Bearer ${session.idToken}` }) as { result?: DynamicQuestionProposalResult; data?: DynamicQuestionProposalResult }
    const value = result.result ?? result.data
    if (!value?.proposal) throw new Error("The AI service returned an invalid proposal.")
    return value
  }
}

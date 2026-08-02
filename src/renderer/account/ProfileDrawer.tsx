import { UserRound } from "lucide-react"
import type { AuthUser } from "../../core/models"
import { DialogFrame } from "../ui/DialogFrame"
export function ProfileDrawer({ user, onClose }: { user: AuthUser; onClose(): void }) { return <DialogFrame presentation="drawer" className="account-drawer" hideFooter title="Profile" busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}><div className="profile-summary"><i><UserRound /></i><div><strong>{user.displayName || "GetGo user"}</strong><span>{user.email}</span><small>{user.emailVerified ? "Verified email" : "Email not verified"}</small></div></div></DialogFrame> }

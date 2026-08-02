import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react"
import type { AuthUser } from "../core/models"
import { Button } from "./ui/Button"
import { ProfileDrawer } from "./account/ProfileDrawer"
import { ChangePasswordDrawer } from "./account/ChangePasswordDrawer"
import { SignOutDialog } from "./account/SignOutDialog"

export function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut(): Promise<void> }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<"profile" | "password" | "logout" | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!(event.target instanceof Element) || (!trigger.current?.contains(event.target) && !event.target.closest(".account-menu"))) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])
  const rect = trigger.current?.getBoundingClientRect()
  return <><Button ref={trigger} className="account-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><UserRound size={16} /><span>{user.displayName || user.email}</span><ChevronDown size={14} /></Button>
    {open && rect && createPortal(<div className="account-menu" role="menu" style={{ top: rect.bottom + 7, right: window.innerWidth - rect.right }}><div className="account-menu-profile"><i><UserRound /></i><span><strong>{user.displayName || "GetGo user"}</strong><small>{user.email}</small></span></div><button role="menuitem" onClick={() => { setOpen(false); setDialog("profile") }}><UserRound />Profile</button><button role="menuitem" onClick={() => { setOpen(false); setDialog("password") }}><KeyRound />Change password</button><button className="account-menu-logout" role="menuitem" onClick={() => { setOpen(false); setDialog("logout") }}><LogOut />Sign out</button></div>, document.body)}
    {dialog === "profile" && <ProfileDrawer user={user} onClose={() => setDialog(null)} />}
    {dialog === "password" && <ChangePasswordDrawer onClose={() => setDialog(null)} />}
    {dialog === "logout" && <SignOutDialog onClose={() => setDialog(null)} onConfirm={onSignOut} />}
  </>
}

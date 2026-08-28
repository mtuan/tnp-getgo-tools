import { useId, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react"
import type { AuthUser } from "../../../shared/domain/models"
import { Button } from "../../../shared/ui/Button"
import { useSelectDropdown } from "../../../shared/ui/Select"
import { ProfileDrawer } from "./ProfileDrawer"
import { ChangePasswordDrawer } from "./ChangePasswordDrawer"
import { SignOutDialog } from "./SignOutDialog"

export function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut(): Promise<void> }) {
  const dropdown = useSelectDropdown()
  const menuId = useId()
  const [dialog, setDialog] = useState<"profile" | "password" | "logout" | null>(null)
  const openMenu = () => dropdown.setOpen(value => {
    if (!value) dropdown.focusItem("first")
    return !value
  })
  const selectDialog = (next: "profile" | "password" | "logout") => {
    dropdown.close(true)
    setDialog(next)
  }
  return <><div className="account-menu-trigger" ref={dropdown.ref}><Button ref={dropdown.triggerRef} className="account-button" aria-controls={menuId} aria-haspopup="menu" aria-expanded={dropdown.open} onKeyDown={dropdown.onTriggerKeyDown} onClick={openMenu}><UserRound size={16} /><span>{user.displayName || user.email}</span><ChevronDown size={14} /></Button></div>
    {dropdown.open && createPortal(<div id={menuId} ref={dropdown.menuRef} className="account-menu" role="menu" onKeyDown={dropdown.onMenuKeyDown} style={{ top: dropdown.position.top, right: window.innerWidth - dropdown.position.left - dropdown.position.width }}><div className="account-menu-profile"><i><UserRound /></i><span><strong>{user.displayName || "GetGo user"}</strong><small>{user.email}</small></span></div><button type="button" role="menuitem" tabIndex={-1} onClick={() => selectDialog("profile")}><UserRound />Profile</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => selectDialog("password")}><KeyRound />Change password</button><button type="button" className="account-menu-logout" role="menuitem" tabIndex={-1} onClick={() => selectDialog("logout")}><LogOut />Sign out</button></div>, document.body)}
    {dialog === "profile" && <ProfileDrawer user={user} onClose={() => setDialog(null)} />}
    {dialog === "password" && <ChangePasswordDrawer onClose={() => setDialog(null)} />}
    {dialog === "logout" && <SignOutDialog onClose={() => setDialog(null)} onConfirm={onSignOut} />}
  </>
}

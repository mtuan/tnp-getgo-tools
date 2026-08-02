import { useMemo, useState, type FormEvent } from "react"
import { DialogFrame } from "../ui/DialogFrame"
import { Form, validateSchema, type FormErrors, type FormSchema, type FormValues } from "../ui/Form"
import { useToast } from "../ui/Toast"

export function ChangePasswordDrawer({ onClose }: { onClose(): void }) {
  const toast = useToast()
  const [values, setValues] = useState<FormValues>({ password: "", confirmPassword: "" })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fields = useMemo<FormSchema[]>(() => [
    { type: "password", name: "password", label: "New password", required: true, autoComplete: "new-password", rules: { minLength: { value: 8, message: "Password must contain at least 8 characters." } } },
    { type: "password", name: "confirmPassword", label: "Confirm new password", required: true, autoComplete: "new-password", rules: { validate: (value, current) => value !== current.password ? "Passwords do not match." : null } },
  ], [])
  const change = (name: string, value: unknown) => { setValues(current => ({ ...current, [name]: value })); setErrors(current => { const next = { ...current }; delete next[name]; return next }) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitError(null)
    const nextErrors = validateSchema(fields, values); setErrors(nextErrors); if (Object.keys(nextErrors).length) return
    setBusy(true)
    try { await window.getgo.changePassword(String(values.password)); toast.show({ title: "Password changed", description: "Your Firebase password has been updated." }); onClose() }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <DialogFrame presentation="drawer" className="account-drawer" title="Change password" submitLabel="Update password" busy={busy} error={submitError} onClose={onClose} onSubmit={submit}><Form fields={fields} values={values} errors={errors} onChange={change} /></DialogFrame>
}

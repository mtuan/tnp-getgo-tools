import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { Popover } from "./Popover";

export function ConfirmPopover({ label, description, triggerLabel, confirmLabel, cancelLabel, busy = false, disabled = false, onConfirm }: {
  label: string;
  description: string;
  triggerLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm(): Promise<void>;
}) {
  return <Popover label={label} className="ui-confirm-popover" width={340} trigger={(props) => <Button {...props} icon={<Trash2 />} variant="solid" color="danger" disabled={disabled || busy}>{triggerLabel}</Button>}>
    {({ close }) => <div className="ui-confirm-popover-content">
      <div className="ui-confirm-popover-message">
        <i><AlertTriangle aria-hidden="true" /></i>
        <div><strong>{label}</strong><p>{description}</p></div>
      </div>
      <div className="ui-confirm-popover-actions">
        <Button variant="text" color="neutral" disabled={busy} onClick={() => close(true)}>{cancelLabel}</Button>
        <Button icon={<Trash2 />} variant="solid" color="danger" loading={busy} onClick={() => {
          close();
          void onConfirm().catch(() => undefined);
        }}>{confirmLabel}</Button>
      </div>
    </div>}
  </Popover>;
}

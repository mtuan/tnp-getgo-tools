import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Save, Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { ErrorFrame } from "./ErrorFrame";
import { useSaveShortcut } from "./useSaveShortcut";

let documentScrollLocks = 0;
let previousBodyOverflow = "";
let previousRootOverflow = "";
let previousBodyPaddingRight = "";
const escapeDialogStack: symbol[] = [];

function lockDocumentScroll(): () => void {
  if (documentScrollLocks === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  documentScrollLocks += 1;
  return () => {
    documentScrollLocks = Math.max(0, documentScrollLocks - 1);
    if (documentScrollLocks > 0) return;
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  };
}

export interface DialogFrameProps {
  title: string;
  busy: boolean;
  error: string | null;
  children: ReactNode;
  onClose(): void;
  onSubmit(event: FormEvent): void;
  onReset?: () => void;
  formId?: string;
  onDelete?: () => Promise<void>;
  presentation?: "drawer" | "modal" | "embedded";
  submitLabel?: string;
  submitDisabled?: boolean;
  saveShortcut?: boolean;
  embeddedFooter?: boolean;
  className?: string;
  hideFooter?: boolean;
  footer?: ReactNode;
}

export function DialogFrame({
  title,
  busy,
  error,
  children,
  onClose,
  onSubmit,
  onReset,
  formId,
  onDelete,
  presentation = "drawer",
  submitLabel = "Save",
  submitDisabled = false,
  saveShortcut = false,
  embeddedFooter = false,
  className = "",
  hideFooter = false,
  footer,
}: DialogFrameProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useSaveShortcut({
    active: saveShortcut,
    enabled: !busy && !submitDisabled,
    onSave: () => formRef.current?.requestSubmit(),
  });
  useEffect(
    () => (presentation === "embedded" ? undefined : lockDocumentScroll()),
    [presentation],
  );
  useEffect(() => {
    if (presentation === "embedded") return;
    const dialogId = Symbol("dialog");
    escapeDialogStack.push(dialogId);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        busy ||
        escapeDialogStack.at(-1) !== dialogId
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      const index = escapeDialogStack.indexOf(dialogId);
      if (index >= 0) escapeDialogStack.splice(index, 1);
    };
  }, [busy, onClose, presentation]);
  async function remove() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }
  const submit = (event: FormEvent) => {
    if (busy || submitDisabled) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };
  const dialog = (
    <section
      className={`crud-dialog presentation-${presentation} ${className}`.trim()}
      role={presentation === "embedded" ? undefined : "dialog"}
      aria-modal={presentation === "embedded" ? undefined : "true"}
      aria-labelledby="crud-title"
    >
      <header>
        <h2 id="crud-title">{title}</h2>
        {presentation !== "embedded" && (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X />
          </button>
        )}
      </header>
      <form
        id={formId}
        ref={formRef}
        onSubmit={submit}
        onReset={(event) => {
          event.preventDefault();
          onReset?.();
        }}
      >
        <div className="crud-body">
          {error && <ErrorFrame message={error} />}
          {children}
        </div>
        {!hideFooter && (presentation !== "embedded" || embeddedFooter) && (
          <footer>
            {footer ?? (
              <>
                {onDelete && (
                  <div className="delete-action">
                    {confirmingDelete ? (
                      <>
                        <span>Move this item to Trash?</span>
                        <Button
                          icon={<Trash2 />}
                          loading={deleting}
                          variant="danger"
                          disabled={busy && !deleting}
                          onClick={() => void remove()}
                        >
                          Move to Trash
                        </Button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <Button
                        icon={<Trash2 />}
                        variant="danger"
                        disabled={busy}
                        onClick={() => setConfirmingDelete(true)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                )}
                {presentation !== "embedded" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                )}
                <Button
                  icon={<Save />}
                  loading={busy && !deleting}
                  disabled={submitDisabled}
                  type="submit"
                  variant="solid"
                >
                  {submitLabel}
                </Button>
              </>
            )}
          </footer>
        )}
      </form>
    </section>
  );
  if (presentation === "embedded") return dialog;
  return createPortal(
    <div
      className={`crud-backdrop presentation-${presentation}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {dialog}
    </div>,
    document.body,
  );
}

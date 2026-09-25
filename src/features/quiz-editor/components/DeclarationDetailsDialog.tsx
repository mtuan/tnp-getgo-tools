import { DialogFrame } from "../../../shared/ui/DialogFrame";
import type { DeclarationDetails } from "../domain/declaration-details";

export function DeclarationDetailsDialog({
  details,
  onClose,
}: {
  details: DeclarationDetails;
  onClose(): void;
}) {
  return (
    <DialogFrame
      presentation="modal"
      className="declaration-details-dialog"
      title={`${details.symbol} — ${details.fileName}`}
      busy={false}
      error={null}
      hideFooter
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
    >
      <p className="declaration-details-location">
        Declaration at {details.fileName}:{details.lineNumber}
      </p>
      <div className="declaration-details-overloads">
        {details.sections.map((section, index) => (
          <section key={`${section.signature}-${index}`}>
            <span>Overload {index + 1}</span>
            {section.documentation && <pre>{section.documentation}</pre>}
            <code>{section.signature}</code>
          </section>
        ))}
      </div>
    </DialogFrame>
  );
}

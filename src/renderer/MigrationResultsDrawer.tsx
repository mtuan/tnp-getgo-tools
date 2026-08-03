import { useState } from "react"
import type { QuizMigrationResult } from "../core/models"
import { AccordionSection } from "./ui/Accordion"
import { DialogFrame } from "./ui/DialogFrame"
import { ErrorFrame } from "./ui/ErrorFrame"

export function MigrationResultsDrawer({ result, attempted, onClose }: { result: QuizMigrationResult; attempted: number; onClose(): void }) {
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(result.failures[0]?.quizId ?? null)
  return <DialogFrame presentation="drawer" className="migration-results-drawer" hideFooter title="Migration results" busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    <div className="migration-results-summary">
      <strong>Migrated {result.migratedQuizIds.length} of {attempted} quizzes</strong>
      <span>{result.failures.length} quiz{result.failures.length === 1 ? "" : "zes"} require attention. The legacy source files were not modified.</span>
    </div>
    <div className="migration-failure-list">
      {result.failures.map(failure => <AccordionSection
        key={failure.quizId}
        variant="panel"
        title={failure.quizId}
        description="Migration failed"
        expanded={expandedQuiz === failure.quizId}
        onExpandedChange={expanded => setExpandedQuiz(expanded ? failure.quizId : null)}
      >
        <ErrorFrame className="migration-failure-error" message={`${failure.quizId}\n${failure.message}`} />
      </AccordionSection>)}
    </div>
  </DialogFrame>
}

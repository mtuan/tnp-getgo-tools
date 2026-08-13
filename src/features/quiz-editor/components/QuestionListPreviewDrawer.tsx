import { useEffect, useState } from "react";
import { Trash2, Zap } from "lucide-react";
import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";
import { questionService, type GeneratedQuestion } from "./question-service";
import { Button } from "../../../shared/ui/Button";
import { DialogFrame } from "../../../shared/ui/DialogFrame";
import { ErrorFrame } from "../../../shared/ui/ErrorFrame";
import { QuestionPreview } from "../../../shared/ui/QuestionPreview";

export function QuestionListPreviewDrawer({
  record,
  manifestPath,
  onClose,
  onDelete,
}: {
  record: ContestQuizQuestionRecord;
  manifestPath: string;
  onClose(): void;
  onDelete(): Promise<void>;
}) {
  const [preview, setPreview] = useState<GeneratedQuestion>(() =>
    questionService.loadStatic(record),
  );
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      setPreview(
        record.advancedDynamic
          ? await questionService.generateDynamic(record)
          : questionService.loadStatic(record, true, preview.question),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (record.advancedDynamic) void generate();
  }, [record.question_no]);

  const remove = async () => {
    if (
      !window.confirm(
        `Delete question ${record.question_no}? Remaining question numbers will be updated. This does not change raw.json or raw.ts.`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setDeleting(false);
    }
  };

  return (
    <DialogFrame
      presentation="drawer"
      className="question-list-preview-drawer"
      title={`Question ${record.question_no} preview`}
      busy={generating || deleting}
      error={null}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
      footer={
        <>
          <Button
            icon={<Trash2 size={15} />}
            loading={deleting}
            variant="solid"
            color="danger"
            disabled={generating}
            onClick={() => void remove()}
          >
            Delete question
          </Button>
          <Button
            icon={<Zap size={15} />}
            loading={generating}
            variant="solid"
            disabled={deleting}
            onClick={() => void generate()}
          >
            Regenerate
          </Button>
        </>
      }
    >
      {error && <ErrorFrame message={error} />}
      <QuestionPreview
        question={preview.question}
        params={preview.params}
        manifestPath={manifestPath}
      />
    </DialogFrame>
  );
}

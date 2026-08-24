import type {
  ContestQuizQuestionRecord,
  QuestionFeedback,
} from "../../../shared/domain/models";
import { AdvancedQuestionEditor } from "./AdvancedQuestionEditor";
import { StaticQuestionEditor } from "./StaticQuestionEditor";
import { Tabs } from "../../../shared/ui/Tabs";
import { questionService } from "./question-service";
import { ReferenceQuestionEditor } from "./ReferenceQuestionEditor";

export type QuestionEditorTab = "static" | "dynamic" | "reference";
interface Props {
  tab: QuestionEditorTab;
  record: ContestQuizQuestionRecord;
  path: string;
  manifestPath: string;
  context: Record<string, unknown>;
  quizSharedCode?: string;
  questions: ContestQuizQuestionRecord[];
  onTabChange(tab: QuestionEditorTab): void;
  onChange(record: ContestQuizQuestionRecord): void;
  onSave(): void;
  onFeedbackSave(
    value: Omit<QuestionFeedback, "updatedAt"> | null,
  ): Promise<void>;
}

export function QuestionEditorTabs(props: Props) {
  const dynamicRecord = props.record.advancedDynamic
    ? props.record
    : questionService.createDynamicDraft(props.record);
  const editor = props.tab === "static" ? (
    <StaticQuestionEditor
      record={props.record}
      manifestPath={props.manifestPath}
      onChange={props.onChange}
      onFeedbackSave={props.onFeedbackSave}
    />
  ) : props.tab === "reference" ? (
    <ReferenceQuestionEditor
      record={props.record}
      questions={props.questions}
      manifestPath={props.manifestPath}
      quizSharedCode={props.quizSharedCode}
      onChange={props.onChange}
    />
  ) : <AdvancedQuestionEditor {...props} record={dynamicRecord} />;
  return (
    <>
      <div className="question-editor-tabs-row"><Tabs<QuestionEditorTab>
        className="question-editor-tabs"
        variant="underline"
        ariaLabel="Question editor"
        value={props.tab}
        onChange={props.onTabChange}
        items={[
          { id: "static", label: "Static" },
          { id: "dynamic", label: "Dynamic" },
          { id: "reference", label: "Reference" },
        ]}
      /></div>
      {editor}
    </>
  );
}

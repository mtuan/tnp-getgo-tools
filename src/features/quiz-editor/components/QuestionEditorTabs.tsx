import type {
  ContestQuizQuestionRecord,
  QuestionFeedback,
} from "../../../shared/domain/models";
import { AdvancedQuestionEditor } from "./AdvancedQuestionEditor";
import { StaticQuestionEditor } from "./StaticQuestionEditor";
import { Tabs } from "../../../shared/ui/Tabs";

export type QuestionEditorTab = "static" | "dynamic";
interface Props {
  tab: QuestionEditorTab;
  record: ContestQuizQuestionRecord;
  path: string;
  manifestPath: string;
  context: Record<string, unknown>;
  onTabChange(tab: QuestionEditorTab): void;
  onChange(record: ContestQuizQuestionRecord): void;
  onSave(): void;
  onFeedbackSave(
    value: Omit<QuestionFeedback, "updatedAt"> | null,
  ): Promise<void>;
}

export function QuestionEditorTabs(props: Props) {
  return (
    <>
      <Tabs<QuestionEditorTab>
        className="question-editor-tabs"
        variant="underline"
        ariaLabel="Question editor"
        value={props.tab}
        onChange={props.onTabChange}
        items={[
          { id: "static", label: "Static" },
          { id: "dynamic", label: "Dynamic" },
        ]}
      />
      {props.tab === "static" ? (
        <StaticQuestionEditor
          record={props.record}
          manifestPath={props.manifestPath}
          onChange={props.onChange}
          onFeedbackSave={props.onFeedbackSave}
        />
      ) : props.record.advancedDynamic ? (
        <AdvancedQuestionEditor {...props} />
      ) : (
        <div className="empty-feature">
          <h2>No dynamic question</h2>
          <p>This question does not contain a dynamic generator.</p>
        </div>
      )}
    </>
  );
}

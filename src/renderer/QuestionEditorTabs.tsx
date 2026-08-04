import type { QuizQuestionRecord } from "../core/models"
import { AdvancedQuestionEditor } from "./AdvancedQuestionEditor"
import { StaticQuestionEditor } from "./StaticQuestionEditor"
import { Tabs } from "./ui/Tabs"

export type QuestionEditorTab = "static" | "dynamic"
interface Props { tab: QuestionEditorTab; record: QuizQuestionRecord; path: string; manifestPath: string; context: Record<string, unknown>; onTabChange(tab: QuestionEditorTab): void; onChange(record: QuizQuestionRecord): void; onSave(): void }

export function QuestionEditorTabs(props: Props) {
  return <><Tabs<QuestionEditorTab> className="question-editor-tabs" variant="underline" ariaLabel="Question editor" value={props.tab} onChange={props.onTabChange} items={[{ id: "static", label: "Static" }, { id: "dynamic", label: "Dynamic" }]} />
    {props.tab === "static" ? <StaticQuestionEditor record={props.record} manifestPath={props.manifestPath} onChange={props.onChange} /> : props.record.advancedDynamic ? <AdvancedQuestionEditor {...props} /> : <div className="empty-feature"><h2>No dynamic question</h2><p>This question does not contain a dynamic generator.</p></div>}
  </>
}

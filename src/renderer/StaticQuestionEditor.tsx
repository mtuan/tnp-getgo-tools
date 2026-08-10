import { useEffect, useState } from "react";
import { Plus, Zap } from "lucide-react";
import { answerTypeDefinitions, staticAnswerType } from "../core/answer-types";
import type {
  ContestQuizQuestionRecord,
  QuestionFeedback as Feedback,
} from "../core/models";
import { answerDetailsComponents, type EditableAnswer } from "./answer-details";
import { Form, type FormSchema } from "./ui/Form";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";
import { QuestionPreview } from "./ui/QuestionPreview";
import { questionService } from "./question-service";
import { QuestionFeedback } from "./QuestionFeedback";

const answerOf = (record: ContestQuizQuestionRecord): EditableAnswer =>
  record.answer &&
  typeof record.answer === "object" &&
  !Array.isArray(record.answer)
    ? (record.answer as EditableAnswer)
    : { type: "input", correct: "" };

export function StaticQuestionEditor({
  record,
  manifestPath,
  onChange,
  onFeedbackSave,
}: {
  record: ContestQuizQuestionRecord;
  manifestPath: string;
  onChange(record: ContestQuizQuestionRecord): void;
  onFeedbackSave(value: Omit<Feedback, "updatedAt"> | null): Promise<void>;
}) {
  const [preview, setPreview] = useState(() =>
    questionService.loadStatic(record),
  );
  const answer = answerOf(record);
  const explanation =
    record.explanation &&
    typeof record.explanation === "object" &&
    !Array.isArray(record.explanation)
      ? (record.explanation as Record<string, unknown>)
      : {};
  const answerType = staticAnswerType(
    answer.type,
    Boolean(answer.choices && Object.keys(answer.choices).length),
  );
  const AnswerDetails = answerDetailsComponents[answerType];
  useEffect(() => setPreview(questionService.loadStatic(record)), [record]);
  const values = {
    category: record.category,
    text_en: record.text_en,
    text_vn: record.text_vn,
    explanation_en: explanation.en,
    explanation_vi: explanation.vi,
    answer_type: answerType,
  };
  const fields: FormSchema[] = [
    { name: "category", label: "Category", type: "text" },
    { name: "text_en", label: "English question", type: "textarea", rows: 5 },
    {
      name: "text_vn",
      label: "Vietnamese question",
      type: "textarea",
      rows: 5,
    },
    {
      name: "explanation_en",
      label: "English explanation",
      type: "textarea",
      rows: 4,
    },
    {
      name: "explanation_vi",
      label: "Vietnamese explanation",
      type: "textarea",
      rows: 4,
    },
    {
      name: "answer_type",
      label: "Answer type",
      type: "select",
      options: answerTypeDefinitions.map((definition) => ({
        value: definition.id,
        label: definition.label,
      })),
    },
  ];
  const updateQuestion = (name: string, value: unknown) => {
    if (name === "explanation_en" || name === "explanation_vi") {
      onChange({
        ...record,
        explanation: {
          ...explanation,
          [name === "explanation_en" ? "en" : "vi"]: value,
        },
      });
      return;
    }
    if (name === "answer_type") {
      if (value === answerType) return;
      const firstCorrect = Array.isArray(answer.correct)
        ? (answer.correct[0] ?? "")
        : (answer.correct ?? "");
      onChange({
        ...record,
        answer:
          value === "choice"
            ? {
                ...answer,
                type: "choice",
                correct: "",
                choices: answer.choices ?? {},
              }
            : value === "multiple_input"
              ? {
                  ...answer,
                  type: "multiple_input",
                  correct: Array.isArray(answer.correct) && answer.correct.length >= 2 ? answer.correct : ["", ""],
                  choices: undefined,
                  inputs: answer.inputs && answer.inputs.length >= 2
                    ? answer.inputs
                    : [
                        { question_en: "", inputType: "text" },
                        { question_en: "", inputType: "text" },
                      ],
                }
            : {
                ...answer,
                type: "input",
                correct: firstCorrect,
                choices: undefined,
                inputType:
                  answer.inputType ??
                  (answer.type === "numeric" ? "number" : "text"),
              },
      });
      return;
    }
    onChange({ ...record, [name]: value });
  };
  const addMultipleInput = () => {
    const inputs = answer.inputs ?? [];
    const correct = Array.isArray(answer.correct) ? answer.correct.map(String) : [];
    onChange({
      ...record,
      answer: {
        ...answer,
        type: "multiple_input",
        choices: undefined,
        correct: [...correct, ""],
        inputs: [...inputs, {
          question_en: "",
          inputType: "text",
        }],
      },
    });
  };

  return (
    <div className="advanced-question-layout static-question-layout">
      <div className="advanced-question-editors">
        <Panel
          className="static-question-form-panel"
          title="Question detail"
          description="Edit the stored question and explanation."
        >
          <div className="static-question-fields">
            <Form
              fields={fields}
              values={values}
              autoFocus={false}
              autoSelectSingleOption={false}
              onChange={updateQuestion}
            />
          </div>
        </Panel>
        <Panel
          className="static-question-form-panel"
          title="Answer details"
          meta={answerType === "multiple_input" ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={addMultipleInput}>
              Add input
            </Button>
          ) : undefined}
          description={
            answerType === "input"
              ? "Configure the accepted value and input control."
              : answerType === "multiple_input"
                ? "Configure each question part and its corresponding input answer."
              : "Configure options and mark one or more correct choices."
          }
        >
          <div className={`static-question-fields ${answerType === "multiple_input" ? "multiple-input-answer-fields" : ""}`}>
            <AnswerDetails
              answer={{
                ...answer,
                type: answerType,
                ...(answerType === "input"
                  ? {
                      inputType:
                        answer.inputType ??
                        (answer.type === "numeric" ? "number" : "text"),
                    }
                  : {}),
              }}
              onChange={(nextAnswer) =>
                onChange({ ...record, answer: nextAnswer })
              }
            />
          </div>
        </Panel>
      </div>
      <div className="advanced-question-sidebar">
        <Panel
          className="question-preview-panel"
          title={`Question ${record.question_no}`}
          meta={
            <span className="question-preview-actions">
              <QuestionFeedback
                feedback={record.feedback}
                onSave={onFeedbackSave}
              />
              <Button
                variant="icon"
                title="Regenerate question"
                aria-label="Regenerate question"
                icon={<Zap size={16} />}
                onClick={() =>
                  setPreview((current) =>
                    questionService.loadStatic(record, true, current.question),
                  )
                }
              />
            </span>
          }
        >
          <QuestionPreview
            question={preview.question}
            params={preview.params}
            manifestPath={manifestPath}
          />
        </Panel>
      </div>
    </div>
  );
}

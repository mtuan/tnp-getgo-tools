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
import { QuestionAssetInput } from "./ui/QuestionAssetInput";
import { questionService } from "./question-service";
import { QuestionFeedback } from "./QuestionFeedback";

const answerOf = (record: ContestQuizQuestionRecord): EditableAnswer =>
  record.answer &&
  typeof record.answer === "object" &&
  !Array.isArray(record.answer)
    ? (record.answer as EditableAnswer)
    : { type: "input", correct: "", inputType: "number" };

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
    { name: "text_en", label: "English question", type: "textarea", autoCompact: true, maxLines: 8 },
    {
      name: "text_vn",
      label: "Vietnamese question",
      type: "textarea",
      autoCompact: true,
      maxLines: 8,
    },
    {
      name: "explanation_en",
      label: "English explanation",
      type: "textarea",
      autoCompact: true,
      maxLines: 6,
    },
    { name: "category", label: "Category", type: "text" },
    {
      name: "explanation_vi",
      label: "Vietnamese explanation",
      type: "textarea",
      autoCompact: true,
      maxLines: 6,
    },
  ];
  const answerTypeFields: FormSchema[] = [{
    name: "answer_type",
    label: "Answer type",
    type: "select",
    options: answerTypeDefinitions.map((definition) => ({ value: definition.id, label: definition.label })),
  }];
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
                choices:
                  answer.choices && Object.keys(answer.choices).length
                    ? answer.choices
                    : {},
                inputs: undefined,
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
                        { question_en: "", inputType: "number" },
                        { question_en: "", inputType: "number" },
                      ],
                }
            : {
                ...answer,
                type: "input",
                correct: firstCorrect,
                choices: undefined,
                inputs: undefined,
                inputType:
                  answer.inputType ??
                  "number",
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
          inputType: "number",
        }],
      },
    });
  };
  const questionImages = Array.isArray(record.image_datas)
    ? record.image_datas.filter((value): value is string => typeof value === "string" && value.startsWith("asset:"))
    : [];
  const updateQuestionImage = (index: number, value: string) => {
    const next = [...questionImages];
    if (value) next[index] = value;
    else next.splice(index, 1);
    onChange({ ...record, image_datas: next });
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
              autoFocus
              autoSelectSingleOption={false}
              onChange={updateQuestion}
            />
          </div>
        </Panel>
        <Panel
          className="static-question-form-panel"
          title="Question images"
          description="Browse, drop, or focus an image field and paste from the clipboard."
        >
          <div className="static-question-fields question-images-editor">
            {questionImages.map((image, index) => <QuestionAssetInput
              key={`${image}-${index}`}
              manifestPath={manifestPath}
              suggestedName={`question-${record.question_no}${index ? `-${index + 1}` : ""}`}
              value={image}
              label={`Question image ${index + 1}`}
              onChange={value => updateQuestionImage(index, value)}
            />)}
            <QuestionAssetInput
              key="new-question-image"
              manifestPath={manifestPath}
              suggestedName={`question-${record.question_no}${questionImages.length ? `-${questionImages.length + 1}` : ""}`}
              label="New question image"
              onChange={value => { if (value) onChange({ ...record, image_datas: [...questionImages, value] }) }}
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
            <Form
              fields={answerTypeFields}
              values={values}
              autoFocus={false}
              autoSelectSingleOption={false}
              onChange={updateQuestion}
            />
            <AnswerDetails
              answer={{
                ...answer,
                type: answerType,
                ...(answerType === "input"
                  ? {
                      inputType:
                        answer.inputType ??
                        "number",
                    }
                  : {}),
              }}
              manifestPath={manifestPath}
              questionNo={record.question_no}
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

import type { SelectOption } from "../../../../shared/ui";
import * as ui from "../../../../shared/ui";

interface TopicFilterControlsProps {
  gradeOptions: SelectOption[];
  subjectOptions: SelectOption[];
  grades: string[];
  subjects: string[];
  gradeLabel: string;
  subjectLabel: string;
  allGradesLabel: string;
  allSubjectsLabel: string;
  onGradesChange(value: string[]): void;
  onSubjectsChange(value: string[]): void;
}

export function TopicFilterControls({
  gradeOptions,
  subjectOptions,
  grades,
  subjects,
  gradeLabel,
  subjectLabel,
  allGradesLabel,
  allSubjectsLabel,
  onGradesChange,
  onSubjectsChange,
}: TopicFilterControlsProps) {
  return (
    <>
      <ui.MultiSelect
        className="manager-topic-filter"
        value={grades}
        options={gradeOptions}
        ariaLabel={gradeLabel}
        placeholder={allGradesLabel}
        presentation="text"
        onValueChange={onGradesChange}
      />
      <ui.MultiSelect
        className="manager-topic-filter"
        value={subjects}
        options={subjectOptions}
        ariaLabel={subjectLabel}
        placeholder={allSubjectsLabel}
        presentation="text"
        onValueChange={onSubjectsChange}
      />
    </>
  );
}

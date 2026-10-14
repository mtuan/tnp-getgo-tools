import type { SelectOption } from "../../../../shared/ui";
import * as ui from "../../../../shared/ui";

interface TopicFilterControlsProps {
  gradeOptions: SelectOption[];
  grades: string[];
  gradeLabel: string;
  allGradesLabel: string;
  onGradesChange(value: string[]): void;
}

export function TopicFilterControls({
  gradeOptions,
  grades,
  gradeLabel,
  allGradesLabel,
  onGradesChange,
}: TopicFilterControlsProps) {
  return (
    <ui.MultiSelect
      className="manager-topic-filter"
      value={grades}
      options={gradeOptions}
      ariaLabel={gradeLabel}
      placeholder={allGradesLabel}
      presentation="text"
      onValueChange={onGradesChange}
    />
  );
}

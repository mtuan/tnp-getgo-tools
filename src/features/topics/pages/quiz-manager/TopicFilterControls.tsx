import type { SelectOption } from "../../../../shared/ui";
import * as ui from "../../../../shared/ui";

interface TopicFilterControlsProps {
  contestOptions: SelectOption[];
  gradeOptions: SelectOption[];
  subjectOptions: SelectOption[];
  stateOptions: SelectOption[];
  contests: string[];
  grades: string[];
  subjects: string[];
  states: string[];
  contestLabel: string;
  gradeLabel: string;
  subjectLabel: string;
  stateLabel: string;
  allContestsLabel: string;
  allGradesLabel: string;
  allSubjectsLabel: string;
  allStatesLabel: string;
  onContestsChange(value: string[]): void;
  onGradesChange(value: string[]): void;
  onSubjectsChange(value: string[]): void;
  onStatesChange(value: string[]): void;
}

export function TopicFilterControls({
  contestOptions,
  gradeOptions,
  subjectOptions,
  stateOptions,
  contests,
  grades,
  subjects,
  states,
  contestLabel,
  gradeLabel,
  subjectLabel,
  stateLabel,
  allContestsLabel,
  allGradesLabel,
  allSubjectsLabel,
  allStatesLabel,
  onContestsChange,
  onGradesChange,
  onSubjectsChange,
  onStatesChange,
}: TopicFilterControlsProps) {
  return (
    <>
      <ui.MultiSelect
        className="manager-topic-filter"
        value={contests}
        options={contestOptions}
        ariaLabel={contestLabel}
        placeholder={allContestsLabel}
        presentation="text"
        onValueChange={onContestsChange}
      />
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
      <ui.MultiSelect
        className="manager-topic-filter"
        value={states}
        options={stateOptions}
        ariaLabel={stateLabel}
        placeholder={allStatesLabel}
        presentation="text"
        onValueChange={onStatesChange}
      />
    </>
  );
}

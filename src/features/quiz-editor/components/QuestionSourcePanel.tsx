import { ExternalLink } from "lucide-react";
import { AccordionSection } from "../../../shared/ui/Accordion";
import { Button } from "../../../shared/ui/Button";

type Source = { provider: string; url: string; externalId?: string; importedAt?: string };
type Solution = { title: string | { en: string; vi: string }; text: string | { en: string; vi: string }; sourceUrl?: string };

const localized = (value: Solution["title"]): string => typeof value === "string" ? value : value.en || value.vi;

export function QuestionSourcePanel({ sourceValue, solutionsValue, expanded, onExpandedChange }: {
  sourceValue: unknown;
  solutionsValue: unknown;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}) {
  const source = sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue)
    ? sourceValue as Partial<Source>
    : null;
  const solutions = Array.isArray(solutionsValue)
    ? solutionsValue.filter((value): value is Solution => Boolean(value && typeof value === "object" && "title" in value && "text" in value))
    : [];
  if (!source?.url && !solutions.length) return null;
  return <AccordionSection
    className="static-question-form-panel imported-question-source-panel"
    title="Imported source"
    description={`${source?.provider ?? "External source"}${solutions.length ? ` · ${solutions.length} solution${solutions.length === 1 ? "" : "s"}` : ""}`}
    expanded={expanded}
    onExpandedChange={onExpandedChange}
    actions={source?.url ? <Button variant="secondary" icon={<ExternalLink size={15} />} onClick={() => void window.getgo.openExternal(source.url!)}>Open source</Button> : undefined}
  >
    <div className="imported-question-source-content">
      {source?.externalId && <p><strong>External ID</strong><span>{source.externalId}</span></p>}
      {source?.importedAt && <p><strong>Imported</strong><span>{new Date(source.importedAt).toLocaleString()}</span></p>}
      {solutions.map((solution, index) => <section key={`${localized(solution.title)}-${index}`}>
        {solutions.length > 1 && <h3>{localized(solution.title)}</h3>}
        <pre>{localized(solution.text)}</pre>
      </section>)}
    </div>
  </AccordionSection>;
}

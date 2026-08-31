import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ListOrdered } from "lucide-react";
import { FourLetterIcon, parseFourLetterIcon } from "../../../shared/ui/FourLetterIcon";
import type { ContentIcon } from "../../../shared/domain/content-icon";

function TopicQuizIcon({
  topicId,
  reference,
  label,
  kind,
}: {
  topicId: string;
  reference?: ContentIcon;
  label: string;
  kind: "topic" | "quiz";
}) {
  const [source, setSource] = useState(() =>
    typeof reference === "string" && reference.startsWith("data:image/") ? reference : "",
  );
  useEffect(() => {
    if (!reference || typeof reference !== "string") return setSource("");
    if (/^(data:image\/|https?:\/\/)/.test(reference)) {
      setSource(reference);
      return;
    }
    if (!reference.startsWith("asset:")) return setSource("");
    let active = true;
    void window.getgo
      .readContentV2TopicAsset(topicId, reference.slice("asset:".length))
      .then((value) => { if (active) setSource(value); })
      .catch(() => { if (active) setSource(""); });
    return () => { active = false; };
  }, [reference, topicId]);
  if (source) return <span className="manager-list-icon"><img src={source} alt={`${label} icon`} /></span>;
  const textIcon = parseFourLetterIcon(reference);
  if (textIcon) return <span className="manager-list-icon"><FourLetterIcon code={textIcon.code} backgroundColor={textIcon.backgroundColor} textColor={textIcon.textColor} label={`${label} icon`} /></span>;
  if (typeof reference === "string" && !reference.startsWith("asset:")) return <span className="manager-list-icon manager-list-icon-text" aria-hidden="true">{reference}</span>;
  return <span className="manager-list-icon manager-list-icon-default" aria-hidden="true">{kind === "topic" ? <BookOpen /> : <ListOrdered />}</span>;
}

export function TopicQuizTreeIdentity({
  toggle,
  topicId,
  reference,
  title,
  description,
  kind,
  count,
}: {
  toggle: ReactNode;
  topicId: string;
  reference?: ContentIcon;
  title: string;
  description: string;
  kind: "topic" | "quiz";
  count?: number;
}) {
  return <div className="topics-tree-identity">
    {toggle}
    <TopicQuizIcon topicId={topicId} reference={reference} label={title} kind={kind} />
    <div><strong>{title}{count === undefined ? "" : ` (${count})`}</strong><span>{description}</span></div>
  </div>;
}

export { TopicQuizIcon };

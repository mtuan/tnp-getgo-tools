import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ListOrdered } from "lucide-react";

function TopicQuizIcon({
  topicId,
  reference,
  label,
  kind,
}: {
  topicId: string;
  reference?: string;
  label: string;
  kind: "topic" | "quiz";
}) {
  const [source, setSource] = useState(() =>
    reference?.startsWith("data:image/") ? reference : "",
  );
  useEffect(() => {
    if (!reference) return setSource("");
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
  if (reference && !reference.startsWith("asset:")) return <span className="manager-list-icon manager-list-icon-text" aria-hidden="true">{reference}</span>;
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
  reference?: string;
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

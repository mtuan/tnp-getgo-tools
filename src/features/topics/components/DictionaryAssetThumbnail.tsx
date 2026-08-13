import { memo, useEffect, useState } from "react";

export const DictionaryAssetThumbnail = memo(function DictionaryAssetThumbnail({
  topicId,
  reference,
  alt,
}: {
  topicId: string;
  reference?: string;
  alt: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    const filename = reference?.replace(/^asset:/, "");
    if (!filename) {
      setSource(null);
      return;
    }
    let active = true;
    setSource(null);
    void window.getgo.readContentV2TopicAsset(topicId, filename)
      .then((value) => { if (active) setSource(value); })
      .catch(() => { if (active) setSource(null); });
    return () => { active = false; };
  }, [reference, topicId]);
  return (
    <span className="topic-dictionary-table-image">
      {source ? <img src={source} alt={alt} /> : <span aria-hidden="true">—</span>}
    </span>
  );
});

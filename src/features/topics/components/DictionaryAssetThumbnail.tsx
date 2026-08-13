import { memo, useEffect, useState } from "react";
import * as ui from "../../../shared/ui";

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
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const filename = reference?.replace(/^asset:/, "");
    if (!filename) {
      setSource(null);
      setLoading(false);
      return;
    }
    let active = true;
    setSource(null);
    setLoading(true);
    void window.getgo.readContentV2TopicAsset(topicId, filename)
      .then((value) => { if (active) setSource(value); })
      .catch(() => { if (active) setSource(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reference, topicId]);
  return <ui.Image className="topic-dictionary-table-image" src={source} alt={alt} fit="contain" inset={4} loading={loading} fallback={<span aria-hidden="true">—</span>} />;
});

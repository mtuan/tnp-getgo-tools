import { useEffect, useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import type { ContentV2TopicAssetSummary } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { DataTable, type DataColumn } from "../../../shared/ui/DataTable";
import { Panel } from "../../../shared/ui/Panel";
import { TableActionButton } from "../../../shared/ui/TableActionButton";

const formatSize = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function TopicAssetsEditor({ topicId }: { topicId: string }) {
  const [assets, setAssets] = useState<ContentV2TopicAssetSummary[]>([]);
  const [selected, setSelected] = useState<ContentV2TopicAssetSummary | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void window.getgo.listContentV2TopicAssets(topicId)
      .then((items) => {
        if (!active) return;
        setAssets(items);
        setSelected((current) =>
          current && items.some((item) => item.filename === current.filename)
            ? items.find((item) => item.filename === current.filename) ?? null
            : items[0] ?? null);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [topicId]);
  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    let active = true;
    void window.getgo.readContentV2TopicAsset(topicId, selected.filename)
      .then((value) => { if (active) setPreview(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [selected, topicId]);
  const columns: DataColumn<ContentV2TopicAssetSummary>[] = [
    { key: "filename", title: "Filename", sortValue: (asset) => asset.filename, render: (asset) => asset.filename },
    { key: "mimeType", title: "Type", width: 150, sortValue: (asset) => asset.mimeType, render: (asset) => asset.mimeType },
    { key: "size", title: "Size", width: 110, align: "right", sortValue: (asset) => asset.size, render: (asset) => formatSize(asset.size) },
    { key: "actions", title: "", width: 64, align: "right", role: "actions", render: (asset) => (
      <TableActionButton
        aria-label={`Delete ${asset.filename}`}
        title={`Delete ${asset.filename}`}
        icon={<Trash2 size={15} />}
        color="danger"
        disabled={Boolean(busy)}
        onClick={() => {
          if (!window.confirm(`Move ${asset.filename} to Trash?`)) return;
          setBusy(asset.filename);
          setError(null);
          void window.getgo.trashContentV2TopicAsset(topicId, asset.filename)
            .then((items) => {
              setAssets(items);
              setSelected((current) => current?.filename === asset.filename
                ? items[0] ?? null
                : current && items.find((item) => item.filename === current.filename) || items[0] || null);
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
            .finally(() => setBusy(null));
        }}
      />
    ) },
  ];
  return (
    <div className="topic-assets-layout">
      <Panel
        title="Shared topic assets"
        description="Images in this folder are referenced by every alphabet and spelling quiz using asset:filename. Existing files are never overwritten during import."
        meta={<div className="topic-assets-actions">
          <Button variant="icon" icon={<FolderOpen />} aria-label="Open assets folder" title="Open folder" onClick={() => void window.getgo.showContentV2TopicAssetsFolder(topicId)} />
          <Button
            variant="solid"
            className="topic-header-icon-action"
            icon={<Plus />}
            loading={busy === "import"}
            disabled={Boolean(busy)}
            aria-label="Import assets"
            title="Import assets"
            onClick={() => {
              setBusy("import"); setError(null);
              void window.getgo.importContentV2TopicAssets(topicId)
                .then((items) => {
                  setAssets(items);
                  setSelected((current) =>
                    current && items.find((item) => item.filename === current.filename)
                      || items[0]
                      || null);
                })
                .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
                .finally(() => setBusy(null));
            }}
          />
        </div>}
      >
        {error && <div className="error-banner"><strong>Asset operation failed</strong><span>{error}</span></div>}
        <DataTable
          ariaLabel="Shared topic assets"
          rows={assets}
          columns={columns}
          rowKey={(asset) => asset.filename}
          defaultSort={{ key: "filename" }}
          selectedRowKey={selected?.filename}
          onRowClick={(asset) => setSelected(asset)}
          emptyText="No shared assets yet."
        />
      </Panel>
      <Panel className="topic-asset-preview-panel" title={selected?.filename ?? "Asset preview"} description={selected ? `${selected.mimeType} · ${formatSize(selected.size)}` : "Select an asset to preview it."}>
        <div className="topic-asset-preview">{preview ? <img src={preview} alt={selected?.filename ?? ""} /> : <span>No asset selected</span>}</div>
      </Panel>
    </div>
  );
}

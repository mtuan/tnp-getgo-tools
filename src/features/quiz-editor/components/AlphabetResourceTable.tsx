import { useState, type FormEvent } from "react";
import { ListPlus } from "lucide-react";
import type { AlphabetLetterResource } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { EditTable, type EditColumnDef } from "../../../shared/ui/EditTable";
import { DialogFrame } from "../../../shared/ui/DialogFrame";

export function alphabetResourceKind(url: string) {
  try {
    const host = new URL(url).hostname.toLocaleLowerCase();
    return host === "youtu.be" || host.endsWith(".youtube.com") ? "YouTube" : "Link";
  } catch {
    return "Invalid URL";
  }
}

export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || null;
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
    const queryId = parsed.searchParams.get("v");
    if (queryId) return queryId;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] || null : null;
  } catch {
    return null;
  }
}

function formatDuration(value: unknown) {
  const totalSeconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const columns: EditColumnDef<AlphabetLetterResource>[] = [
  { key: "kind", dataKey: "url", title: "Type", width: 90, field: { type: "text", name: "url" }, renderView: (value) => alphabetResourceKind(String(value ?? "")) },
  { key: "title", dataKey: "title", title: "Title", width: "25%", field: { type: "text", name: "title", required: true, placeholder: "Video or resource title" } },
  { key: "url", dataKey: "url", title: "URL", width: "38%", field: { type: "url", name: "url", required: true, placeholder: "https://www.youtube.com/watch?v=…" } },
  { key: "duration", dataKey: "durationSeconds", title: "Duration", width: 105, field: { type: "number", name: "durationSeconds", min: 1, step: 1, placeholder: "Seconds" }, renderView: formatDuration },
  { key: "description", dataKey: "description", title: "Description", field: { type: "text", name: "description", placeholder: "Optional note" } },
];

export function AlphabetResourceTable({
  letter,
  resources,
  onChange,
  selectedRowIndex,
  onRowSelect,
}: {
  letter: string;
  resources: AlphabetLetterResource[];
  onChange(resources: AlphabetLetterResource[]): void;
  selectedRowIndex?: number;
  onRowSelect?(index: number): void;
}) {
  return (
    <>
      <EditTable
        ariaLabel={`Resources for ${letter || "letter"}`}
        rows={resources}
        columns={columns}
        rowKey="id"
        addLabel="Add resource"
        emptyText="No external resources for this letter yet."
        selectedRowIndex={selectedRowIndex}
        onRowClick={(_row, index) => onRowSelect?.(index)}
        onRowAdd={() => onChange([...resources, { id: `resource-${Date.now().toString(36)}`, title: "", url: "", description: "" }])}
        onRowChange={(index, field, value) => onChange(resources.map((item, itemIndex) => itemIndex === index
          ? { ...item, [field]: field === "durationSeconds" ? (value === "" || value == null ? undefined : Number(value)) : String(value ?? "") }
          : item))}
        onRowDelete={(index) => onChange(resources.filter((_, itemIndex) => itemIndex !== index))}
      />
    </>
  );
}

export function AlphabetResourceImportButton({
  resources,
  onChange,
}: {
  resources: AlphabetLetterResource[];
  onChange(resources: AlphabetLetterResource[]): void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function importLinks(event: FormEvent) {
    event.preventDefault();
    const links = bulkText.match(/https?:\/\/[^\s<>\])]+/g) ?? [];
    if (!links.length) {
      setBulkError("Paste at least one YouTube link.");
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const resolver = window.getgo.resolveYouTubeResources;
      if (typeof resolver !== "function") {
        throw new Error("GetGo Tools must restart once to enable YouTube detail fetching.");
      }
      const resolved = await resolver(links);
      const failures = resolved.filter((item) => item.error);
      const nextResources = resources.map((resource) => ({ ...resource }));
      let added = 0;
      let enriched = 0;
      let duplicates = 0;
      let missingDurations = 0;
      for (const item of resolved) {
        if (!item.title || item.error) continue;
        const videoId = youtubeVideoId(item.url);
        const existingIndex = nextResources.findIndex((resource) =>
          videoId ? youtubeVideoId(resource.url) === videoId : resource.url === item.url,
        );
        if (existingIndex >= 0) {
          const existing = nextResources[existingIndex];
          if (item.durationSeconds && !existing.durationSeconds) {
            nextResources[existingIndex] = { ...existing, durationSeconds: item.durationSeconds };
            enriched += 1;
          } else {
            duplicates += 1;
          }
        } else {
          nextResources.push({
            id: `resource-${Date.now().toString(36)}-${added}`,
            title: item.title,
            url: item.url,
            description: "",
            ...(item.durationSeconds ? { durationSeconds: item.durationSeconds } : {}),
          });
          added += 1;
        }
        if (!item.durationSeconds) missingDurations += 1;
      }
      if (added || enriched) onChange(nextResources);
      if (failures.length || missingDurations) {
        const summary = `${added} added${enriched ? `; ${enriched} existing resource${enriched === 1 ? "" : "s"} updated` : ""}${duplicates ? `; ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""}.`;
        const durationWarning = missingDurations
          ? ` ${missingDurations} video duration${missingDurations === 1 ? " was" : "s were"} unavailable. Restart GetGo Tools if it has not been restarted since duration support was added.`
          : "";
        const failureDetails = failures.length
          ? `\n${failures.map((item) => `${item.url}: ${item.error}`).join("\n")}`
          : "";
        setBulkError(`${summary}${durationWarning}${failureDetails}`);
      } else {
        setBulkOpen(false);
        setBulkText("");
      }
    } catch (cause) {
      setBulkError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <Button icon={<ListPlus />} onClick={() => setBulkOpen(true)}>Paste links</Button>
      {bulkOpen && (
        <DialogFrame presentation="modal" className="alphabet-resource-import" title="Import YouTube resources" busy={bulkBusy} error={bulkError} onClose={() => setBulkOpen(false)} onSubmit={importLinks} submitLabel="Fetch details and add">
          <label>
            YouTube links
            <textarea autoFocus rows={12} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"Paste one or more links here. Markdown links and plain URLs are both supported."} />
          </label>
          <p>Video titles and durations are fetched from YouTube. Existing links missing duration are updated instead of skipped. Review the list, then use Save Question to write it to the letter.</p>
        </DialogFrame>
      )}
    </>
  );
}

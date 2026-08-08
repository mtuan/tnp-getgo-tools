import { useState, type FormEvent } from "react";
import { ListPlus } from "lucide-react";
import type { AlphabetLetterResource } from "../core/models";
import { Button } from "./ui/Button";
import { EditTable, type EditColumnDef } from "./ui/EditTable";
import { DialogFrame } from "./ui/DialogFrame";

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

const columns: EditColumnDef<AlphabetLetterResource>[] = [
  { key: "kind", dataKey: "url", title: "Type", width: 90, field: { type: "text", name: "url" }, renderView: (value) => alphabetResourceKind(String(value ?? "")) },
  { key: "title", dataKey: "title", title: "Title", width: "25%", field: { type: "text", name: "title", required: true, placeholder: "Video or resource title" } },
  { key: "url", dataKey: "url", title: "URL", width: "38%", field: { type: "url", name: "url", required: true, placeholder: "https://www.youtube.com/watch?v=…" } },
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
        onRowChange={(index, field, value) => onChange(resources.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: String(value ?? "") } : item))}
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
        throw new Error("GetGo Tools must restart once to enable YouTube title fetching.");
      }
      const resolved = await resolver(links);
      const existing = new Set(resources.map((item) => item.url));
      const successful = resolved.filter((item) => {
        if (!item.title || item.error || existing.has(item.url)) return false;
        existing.add(item.url);
        return true;
      });
      onChange([
        ...resources,
        ...successful.map((item, index) => ({
          id: `resource-${Date.now().toString(36)}-${index}`,
          title: item.title!,
          url: item.url,
          description: "",
        })),
      ]);
      const failures = resolved.filter((item) => item.error);
      const duplicates = resolved.length - failures.length - successful.length;
      if (failures.length) {
        setBulkError(`${successful.length} added. ${failures.length} could not be resolved${duplicates ? `; ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""}.\n${failures.map((item) => `${item.url}: ${item.error}`).join("\n")}`);
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
        <DialogFrame presentation="modal" className="alphabet-resource-import" title="Import YouTube resources" busy={bulkBusy} error={bulkError} onClose={() => setBulkOpen(false)} onSubmit={importLinks} submitLabel="Fetch titles and add">
          <label>
            YouTube links
            <textarea autoFocus rows={12} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"Paste one or more links here. Markdown links and plain URLs are both supported."} />
          </label>
          <p>Video titles are fetched from YouTube. Duplicate video links are skipped. Review the list, then use Save Question to write it to the letter.</p>
        </DialogFrame>
      )}
    </>
  );
}

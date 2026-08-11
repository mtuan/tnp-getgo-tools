import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { MarketplacePublisherRecord } from "../core/models";
import { Button, DialogFrame, Form, PageHeader, Panel, useSaveShortcut, useToast, type FormSchema, type FormValues } from "./ui";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

const emptyPublisher = (): MarketplacePublisherRecord => ({
  id: "",
  name: { en: "", vi: "" },
  description: { en: "", vi: "" },
  verified: false,
  status: "active",
});

export function PublisherManagerPage({ locale }: { locale: "en" | "vi" }) {
  const copy = (locale === "vi" ? vi : en).publishers;
  const toast = useToast();
  const [publishers, setPublishers] = useState<MarketplacePublisherRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarketplacePublisherRecord>(emptyPublisher);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const selected = publishers.find(item => item.id === selectedId);

  const load = useCallback(async () => {
    const records = await window.getgo.listMarketplacePublishers();
    setPublishers(records);
    const first = records.find(item => item.id === selectedId) ?? records[0];
    setSelectedId(first?.id ?? null);
    setDraft(first ? structuredClone(first) : emptyPublisher());
  }, [selectedId]);
  useEffect(() => { void load(); }, []); // Load once; mutations reconcile locally.

  const fields = useMemo<FormSchema[]>(() => [
    [{ type: "text", name: "id", label: copy.fields.id, required: true, readOnly: Boolean(selected) }, { type: "select", name: "status", label: copy.fields.status, options: [{ value: "active", label: copy.active }, { value: "suspended", label: copy.suspended }] }],
    { section: copy.identity, fields: [
      [{ type: "text", name: "nameEn", label: copy.fields.nameEn, required: true }, { type: "text", name: "nameVi", label: copy.fields.nameVi, required: true }],
      [{ type: "textarea", name: "descriptionEn", label: copy.fields.descriptionEn }, { type: "textarea", name: "descriptionVi", label: copy.fields.descriptionVi }],
      { type: "toggle", name: "verified", label: copy.fields.verified, presentation: "row" },
    ] },
    { section: copy.links, fields: [
      [{ type: "url", name: "website", label: copy.fields.website }, { type: "url", name: "supportUrl", label: copy.fields.supportUrl }],
      [{ type: "text", name: "logo", label: copy.fields.logo }, { type: "text", name: "banner", label: copy.fields.banner }],
    ] },
  ], [copy, selected]);
  const values: FormValues = { id: draft.id, status: draft.status, nameEn: draft.name.en, nameVi: draft.name.vi, descriptionEn: draft.description.en, descriptionVi: draft.description.vi, verified: draft.verified, website: draft.website ?? "", supportUrl: draft.supportUrl ?? "", logo: draft.logo ?? "", banner: draft.banner ?? "" };
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected ?? emptyPublisher());
  useSaveShortcut({ active: true, enabled: dirty && !busy && Boolean(draft.id && draft.name.en && draft.name.vi), onSave: () => formRef.current?.requestSubmit() });
  const change = (name: string, value: unknown) => setDraft(current => {
    if (name === "nameEn" || name === "nameVi") return { ...current, name: { ...current.name, [name === "nameEn" ? "en" : "vi"]: String(value) } };
    if (name === "descriptionEn" || name === "descriptionVi") return { ...current, description: { ...current.description, [name === "descriptionEn" ? "en" : "vi"]: String(value) } };
    return { ...current, [name]: value } as MarketplacePublisherRecord;
  });
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const saved = await window.getgo.saveMarketplacePublisher(draft);
      setPublishers(current => [...current.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.en.localeCompare(b.name.en)));
      setSelectedId(saved.id); setDraft(structuredClone(saved));
      toast.show({ title: copy.saved, variant: "success" });
    } catch (error) { toast.show({ title: String(error), variant: "error" }); } finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true);
    try { const result = await window.getgo.generateMarketplaceMetadata(); toast.show({ title: copy.generated.replace("{topics}", String(result.topics)).replace("{quizzes}", String(result.quizzes)), variant: "success" }); }
    catch (error) { toast.show({ title: String(error), variant: "error" }); } finally { setBusy(false); }
  };

  return <>
    <PageHeader title={copy.title} description={copy.description} actions={<><Button icon={<Sparkles />} loading={busy} onClick={() => void generate()}>{copy.generate}</Button><Button variant="primary" icon={<Plus />} onClick={() => { setSelectedId(null); setDraft(emptyPublisher()); }}>{copy.new}</Button></>} />
    <div className="publisher-manager-layout">
      <Panel title={copy.list}>
        <div className="publisher-manager-list">{publishers.map(item => <Button key={item.id} variant={item.id === selectedId ? "primary" : "secondary"} onClick={() => { setSelectedId(item.id); setDraft(structuredClone(item)); }}>{item.name[locale]}</Button>)}</div>
      </Panel>
      <Panel title={selected ? copy.edit : copy.create} meta={selected && <Button variant="icon" color="danger" icon={<Trash2 />} aria-label={copy.delete} title={copy.delete} onClick={() => setDeleteOpen(true)} />}>
        <form ref={formRef} onSubmit={save}><Form fields={fields} values={values} onChange={change} /><div className="form-actions"><Button type="button" disabled={!dirty || busy} onClick={() => setDraft(structuredClone(selected ?? emptyPublisher()))}>{copy.discard}</Button><Button type="submit" variant="primary" loading={busy} disabled={!dirty || !draft.id || !draft.name.en || !draft.name.vi}>{copy.save}</Button></div></form>
      </Panel>
    </div>
    {deleteOpen && selected && <DialogFrame presentation="modal" title={copy.delete} busy={busy} error={null} onClose={() => setDeleteOpen(false)} onSubmit={event => event.preventDefault()} footer={<><Button onClick={() => setDeleteOpen(false)}>{copy.discard}</Button><Button variant="danger" icon={<Trash2 />} loading={busy} onClick={() => void (async () => { setBusy(true); try { await window.getgo.deleteMarketplacePublisher(selected.id); setDeleteOpen(false); await load(); } finally { setBusy(false); } })()}>{copy.delete}</Button></>}><p>{copy.deleteConfirm}</p></DialogFrame>}
  </>;
}

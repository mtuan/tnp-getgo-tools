import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, FileImage, FileText, Files, FolderOpen, RotateCw, Trash2 } from "lucide-react";
import type { ImagePdfSelection } from "../core/models";
import { createImagePdf } from "./image-pdf/create-image-pdf";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { ActionMenu, Button, PageHeader, Panel, useToast } from "./ui";

interface ImageItem { id: string; path: string; directory: string; name: string; size: number; previewUrl: string; rotation: 0 | 90 | 180 | 270 }
const filenameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function ImagePdfPage({ locale }: { locale: "en" | "vi" }) {
  const copy = (locale === "vi" ? vi : en).imagePdf;
  const toast = useToast();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [detectingOrientation, setDetectingOrientation] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [defaultDirectory, setDefaultDirectory] = useState<string | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => () => imagesRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl)), []);

  const addSelection = (selection: ImagePdfSelection) => {
    if (!selection.images.length) {
      toast.show({ title: copy.noImagesTitle, description: copy.noImagesDescription, variant: "info" });
      return;
    }
    const added = selection.images.map(image => ({
      id: crypto.randomUUID(),
      path: image.path,
      directory: image.directory,
      name: image.name,
      size: image.size,
      previewUrl: URL.createObjectURL(new Blob([image.data], { type: image.mimeType })),
      rotation: 0 as const,
    }));
    setImages(current => {
      const existing = new Set(current.map(item => item.path));
      const uniqueAdded = added.filter(item => {
        if (existing.has(item.path)) {
          URL.revokeObjectURL(item.previewUrl);
          return false;
        }
        existing.add(item.path);
        return true;
      });
      return [...current, ...uniqueAdded]
        .sort((left, right) => filenameCollator.compare(left.name, right.name));
    });
    setDefaultDirectory(selection.defaultDirectory);
  };
  const browse = async (mode: "files" | "folder") => {
    setBrowsing(true);
    try {
      const selection = await window.getgo.browseImagePdfInputs(mode);
      if (selection) addSelection(selection);
    } catch (cause) {
      console.error("[GetGo Tools][Image PDF] Browse failed", cause);
      toast.show({ title: copy.browseFailedTitle, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally {
      setBrowsing(false);
    }
  };
  const drop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const paths = Array.from(event.dataTransfer.files).map(file => window.getgo.resolveDroppedFilePath(file)).filter(Boolean);
    if (!paths.length) return;
    setBrowsing(true);
    try {
      addSelection(await window.getgo.loadImagePdfInputs(paths));
    } catch (cause) {
      console.error("[GetGo Tools][Image PDF] Drop failed", cause);
      toast.show({ title: copy.browseFailedTitle, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally {
      setBrowsing(false);
    }
  };
  const remove = (id: string) => {
    const removed = images.find(item => item.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const next = images.filter(item => item.id !== id);
    setImages(next);
    setDefaultDirectory(next[0]?.directory ?? null);
  };
  const removeAll = () => {
    images.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setImages([]);
    setDefaultDirectory(null);
  };
  const move = (index: number, offset: number) => setImages(current => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const generate = async () => {
    if (!images.length || generating) return;
    setGenerating(true);
    try {
      const pdf = await createImagePdf(images.map(item => ({ name: item.name, url: item.previewUrl, rotation: item.rotation })));
      const result = await window.getgo.saveGeneratedPdf(pdf, "images.pdf", defaultDirectory);
      if (result) toast.show({
        title: copy.savedTitle,
        description: result.filePath,
        action: { label: copy.openContainingFolder, onSelect: () => void window.getgo.showInFolder(result.filePath) },
      });
    } catch (cause) {
      console.error("[GetGo Tools][Image PDF] Generation failed", cause);
      toast.show({ title: copy.failedTitle, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally {
      setGenerating(false);
    }
  };
  const autoRotate = async () => {
    if (!images.length || detectingOrientation) return;
    setDetectingOrientation(true);
    try {
      const startedAt = performance.now();
      const results = await window.getgo.detectImagePdfOrientations(images.map(item => item.path));
      const byPath = new Map(results.map(result => [result.path, result]));
      setImages(current => current.map(item => ({ ...item, rotation: byPath.get(item.path)?.rotation ?? item.rotation })));
      const rotated = results.filter(result => result.detected && result.rotation !== 0).length;
      const undetected = results.filter(result => !result.detected).length;
      console.info("[GetGo Tools][Image PDF] Text orientation detection completed", { count: results.length, rotated, undetected, durationMs: Math.round(performance.now() - startedAt), results });
      toast.show({
        title: copy.autoRotateComplete,
        description: copy.autoRotateResult.replace("{rotated}", String(rotated)).replace("{undetected}", String(undetected)),
      });
    } catch (cause) {
      console.error("[GetGo Tools][Image PDF] Text orientation detection failed", cause);
      toast.show({ title: copy.autoRotateFailed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally {
      setDetectingOrientation(false);
    }
  };

  return <section className="image-pdf-page">
    <PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<>
        <Button variant="outline" color="primary" icon={<RotateCw />} loading={detectingOrientation} disabled={!images.length || generating || browsing} onClick={() => void autoRotate()}>{copy.autoRotate}</Button>
        <Button variant="solid" icon={<FileText />} loading={generating} disabled={!images.length || detectingOrientation} onClick={() => void generate()}>{copy.generate}</Button>
      </>}
    />
    <Panel
      title={copy.pagesTitleWithCount.replace("{count}", String(images.length))}
      description={copy.pagesDescription}
      className={`image-pdf-panel ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); if (!generating && !browsing) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); if (!generating && !browsing) event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => void drop(event)}
      meta={<span className="image-pdf-panel-meta">
        <ActionMenu label={copy.browse} variant="solid" color="primary" disabled={browsing || generating} items={[
          { id: "files", label: copy.browseFiles, icon: Files, onSelect: () => void browse("files") },
          { id: "folder", label: copy.browseFolder, icon: FolderOpen, onSelect: () => void browse("folder") },
        ]} />
        <Button variant="outline" color="danger" icon={<Trash2 />} disabled={!images.length || generating} onClick={removeAll}>{copy.removeAll}</Button>
      </span>}
    >
      {!images.length ? <div className="image-pdf-empty"><FileImage /><strong>{copy.emptyTitle}</strong><span>{copy.panelDropDescription}</span></div> : <div className="image-pdf-list">
        {images.map((item, index) => <article className="image-pdf-item" key={item.id}>
          <span className="image-pdf-page-number">{index + 1}</span>
          <span className="image-pdf-thumbnail"><img src={item.previewUrl} alt="" style={{ transform: `rotate(${item.rotation}deg)` }} /></span>
          <div><strong title={item.name}>{item.name}</strong><span>{(item.size / 1024).toLocaleString(locale, { maximumFractionDigits: 0 })} KB{item.rotation ? ` · ${item.rotation}°` : ""}</span></div>
          <div className="image-pdf-actions">
            <Button variant="icon" icon={<ArrowUp />} disabled={index === 0 || generating} aria-label={copy.moveUp} title={copy.moveUp} onClick={() => move(index, -1)} />
            <Button variant="icon" icon={<ArrowDown />} disabled={index === images.length - 1 || generating} aria-label={copy.moveDown} title={copy.moveDown} onClick={() => move(index, 1)} />
            <Button variant="icon" color="danger" icon={<Trash2 />} disabled={generating} aria-label={copy.remove} title={copy.remove} onClick={() => remove(item.id)} />
          </div>
        </article>)}
      </div>}
    </Panel>
  </section>;
}

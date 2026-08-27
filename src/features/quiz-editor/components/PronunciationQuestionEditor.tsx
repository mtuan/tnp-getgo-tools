import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PronunciationCell, PronunciationSoundQuestionRecord, QuizQuestionRecord } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { Form, type FormSchema, type FormValues } from "../../../shared/ui/Form";
import { Panel } from "../../../shared/ui/Panel";
import { Tabs } from "../../../shared/ui/Tabs";
import { logSpokenContent } from "../../speech/components/speech-log";

type PreviewPresentation = "table" | "links";
interface ConnectorLayout {
  width: number;
  height: number;
  paths: string[];
}
const connectorBetween = (container: DOMRect, source: DOMRect, target: DOMRect) => {
  const targetCenter = {
    x: target.left - container.left + target.width / 2,
    y: target.top - container.top + target.height / 2,
  };
  const gap = 16;
  const x1 = source.right - container.left + gap;
  const y1 = source.top - container.top + source.height / 2;
  const x2 = target.left - container.left - gap;
  const y2 = targetCenter.y;
  const verticalDistance = y2 - y1;
  if (Math.abs(verticalDistance) < 1) return `M ${x1 + 8} ${y1} H ${x2 - 8}`;
  const radius = Math.min(16, Math.abs(verticalDistance) / 2);
  const trunkX = x1 + 16;
  const direction = Math.sign(verticalDistance);
  const cornerApproachY = y2 - direction * radius;
  return `M ${x1} ${y1} H ${trunkX} V ${cornerApproachY} Q ${trunkX} ${y2}, ${trunkX + radius} ${y2} H ${x2}`;
};
const cell = (text: string): PronunciationCell => ({ text: text.trim() });
const lines = (value: unknown) => String(value ?? "").split("\n").map(item => item.trim()).filter(Boolean);
const toneValues = (value: unknown) => {
  const values = String(value ?? "").split(/\r?\n|\||,/).map(item => item.trim());
  if (values.length === 1 && !values[0]) return [];
  // A leading empty CSV entry is the Vietnamese ngang tone: no written mark.
  return values.filter((item, index) => index === 0 || Boolean(item));
};
const toneText = (record: PronunciationSoundQuestionRecord) => record.tones.map(item => item.text).join(", ");

function speak(value: PronunciationCell) {
  if (!value.text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value.speech?.trim() || value.text);
  utterance.lang = "vi-VN";
  utterance.rate = 0.75;
  logSpokenContent(utterance.text, "Vietnamese", "letter");
  window.speechSynthesis.speak(utterance);
}

function SoundCell({ value }: { value: PronunciationCell }) {
  return <Button aria-label={value.speech?.trim() || value.text} variant="text" color="neutral" className="pronunciation-sound-button" onClick={() => speak(value)}>{value.text}</Button>;
}

const fields: FormSchema[] = [
  { type: "text", name: "title", label: "Title" },
  { type: "text", name: "letter", label: "Letter", required: true },
  { type: "text", name: "letterSpeech", label: "Letter sound", required: true, helper: "Spoken value, for example “bờ”." },
  { type: "text", name: "tones", label: "Tone columns", helper: "Separate tone labels with commas. Start with an empty value for no tone, for example , ´, `, ˀ, ˜, •." },
  {
    type: "textarea",
    name: "sounds",
    label: "Sounds and forms",
    required: true,
    autoCompact: true,
    maxLines: 1_000,
    helper: "One sound per line: sound, base form, sắc, huyền, hỏi, ngã, nặng.",
  },
];

export function PronunciationQuestionEditor({ record, onChange }: { record: PronunciationSoundQuestionRecord; onChange(record: QuizQuestionRecord): void }) {
  const [preview, setPreview] = useState<PreviewPresentation>("table");
  const [draft, setDraft] = useState(record);
  const [tonesInput, setTonesInput] = useState(() => toneText(record));
  const editingTonesRef = useRef(false);
  const questionNoRef = useRef(record.question_no);
  const linksPreviewRef = useRef<HTMLDivElement>(null);
  const linksSourceRef = useRef<HTMLDivElement>(null);
  const linksTargetRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [connectorLayout, setConnectorLayout] = useState<ConnectorLayout>({ width: 1, height: 1, paths: [] });
  const pendingRef = useRef<PronunciationSoundQuestionRecord | null>(null);
  const timerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const pendingMatchesRecord = Boolean(pendingRef.current && JSON.stringify(pendingRef.current) === JSON.stringify(record));
    if (pendingMatchesRecord) return;
    setDraft(record);
    if (!editingTonesRef.current || questionNoRef.current !== record.question_no) setTonesInput(toneText(record));
    questionNoRef.current = record.question_no;
  }, [record]);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  useLayoutEffect(() => {
    if (preview !== "links") return;
    const container = linksPreviewRef.current;
    const source = linksSourceRef.current;
    if (!container || !source) return;
    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const paths = linksTargetRefs.current.slice(0, draft.sounds.length).flatMap(target => {
        if (!target) return [];
        return [connectorBetween(containerRect, sourceRect, target.getBoundingClientRect())];
      });
      setConnectorLayout({ width: containerRect.width, height: containerRect.height, paths });
    };
    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(source);
    linksTargetRefs.current.slice(0, draft.sounds.length).forEach(target => target && observer.observe(target));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [draft.sounds.length, preview]);
  const commit = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    onChangeRef.current(pending);
  };
  const scheduleCommit = (next: PronunciationSoundQuestionRecord) => {
    pendingRef.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(commit, 300);
  };
  const values: FormValues = {
    title: draft.title ?? "",
    letter: draft.letter.text,
    letterSpeech: draft.letter.speech ?? draft.letter.text,
    tones: tonesInput,
    sounds: draft.sounds.map(item => [item.sound.text, ...item.forms.map(form => form.text)].join(", ")).join("\n"),
  };
  const change = (name: string, value: unknown) => {
    const next: PronunciationSoundQuestionRecord = { ...draft };
    if (name === "title") next.title = String(value) || undefined;
    if (name === "letter") next.letter = { ...draft.letter, text: String(value) };
    if (name === "letterSpeech") next.letter = { ...draft.letter, speech: String(value) || undefined };
    if (name === "tones") {
      setTonesInput(String(value ?? ""));
      next.tones = toneValues(value).map(cell);
    }
    if (name === "sounds") next.sounds = lines(value).map(line => {
      const [sound = "", ...forms] = line.split(/\s*(?:\||,)\s*/).map(item => item.trim());
      return { sound: cell(sound), forms: forms.filter(Boolean).map(cell) };
    }).filter(item => item.sound.text && item.forms.length > 0);
    setDraft(next);
    scheduleCommit(next);
  };

  return <div
    className="pronunciation-question-workspace"
    onFocusCapture={(event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === "tones") editingTonesRef.current = true;
    }}
    onBlurCapture={(event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === "tones") editingTonesRef.current = false;
      commit();
    }}
  >
    <div className="advanced-question-layout pronunciation-question-editor">
      <Panel title="Pronunciation content"><div className="pronunciation-panel-body"><Form fields={fields} values={values} errors={{}} autoFocus={false} onChange={change} /></div></Panel>
      <Panel title="Interactive preview" meta={<Tabs ariaLabel="Preview presentation" value={preview} items={[{ id: "table", label: "Table" }, { id: "links", label: "Links" }]} onChange={(value) => setPreview(value as PreviewPresentation)} />}>
        <div className="pronunciation-panel-body pronunciation-preview-body">
          {preview === "table"
            ? <div className="pronunciation-table-preview" style={{ gridTemplateColumns: `repeat(${Math.max(1, draft.tones.length + 1)}, minmax(0, 1fr))` }}>
                <div className="pronunciation-table-cell pronunciation-table-corner"><SoundCell value={draft.letter} /></div>
                {draft.tones.map((value, index) => <div className="pronunciation-table-cell pronunciation-table-header" key={`tone-${index}`}><SoundCell value={value} /></div>)}
                {draft.sounds.flatMap((item, rowIndex) => [
                  <div className="pronunciation-table-cell pronunciation-table-row-header" key={`sound-${rowIndex}`}><SoundCell value={item.sound} /></div>,
                  ...draft.tones.map((_tone, formIndex) => <div className="pronunciation-table-cell" key={`form-${rowIndex}-${formIndex}`}>{item.forms[formIndex] ? <SoundCell value={item.forms[formIndex]} /> : null}</div>),
                ])}
              </div>
            : <div className="pronunciation-links-preview" ref={linksPreviewRef}>
                <div className="pronunciation-links-source" ref={linksSourceRef}><SoundCell value={draft.letter} /></div>
                <svg className="pronunciation-links-connectors" aria-hidden="true" viewBox={`0 0 ${connectorLayout.width} ${connectorLayout.height}`}>
                  <defs><marker id="pronunciation-arrowhead" viewBox="0 0 4 4" refX="3.4" refY="2" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L4,2 L0,4" /></marker></defs>
                  {connectorLayout.paths.map((path, index) => <path className="pronunciation-connector-path" key={index} d={path} />)}
                </svg>
                <div className="pronunciation-links-source-track" aria-hidden="true" />
                <div className="pronunciation-links-branches">{draft.sounds.map((item, index) => <div className="pronunciation-link-row" key={index}>
                  <div className="pronunciation-link-target" ref={(element) => { linksTargetRefs.current[index] = element; }}><SoundCell value={item.sound} /></div>
                  <svg className="pronunciation-link-arrow" aria-hidden="true" viewBox="0 0 64 24"><path d="M2 12 H56" /><path d="M47 3 L56 12 L47 21" /></svg>
                  <SoundCell value={item.forms[0] ?? item.sound} />
                </div>)}</div>
              </div>}
        </div>
      </Panel>
    </div>
  </div>;
}

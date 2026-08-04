import Editor, { DiffEditor, loader, type DiffOnMount, type OnMount, type OnValidate } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import * as monacoTypeScript from "monaco-editor/languages/features/typescript/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import { useCallback, useEffect, useRef, useState } from "react"
import { visibleModelValue } from "../core/editor-context"
import quizBuilderTypes from "./quiz-builder.monaco.json"

self.MonacoEnvironment = { getWorker(_id, label) { if (label === "typescript" || label === "javascript") return new TypeScriptWorker(); if (label === "json") return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })

function configureMonaco() {
  monacoTypeScript.typescriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, strict: true, strictNullChecks: false, noEmit: true, target: monacoTypeScript.ScriptTarget.ESNext, moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs, module: monacoTypeScript.ModuleKind.ESNext, lib: ["es2022", "dom"] })
  monacoTypeScript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [7006, 7031] })
  for (const library of quizBuilderTypes.libraries) monacoTypeScript.typescriptDefaults.addExtraLib(library.content, library.filePath)
}

export interface EditorLineRange { startLineNumber: number; endLineNumber: number }
interface QuizCodeEditorProps {
  value: string; path: string; onChange(value: string): void; onSave(): void
  autoHeight?: boolean; minHeight?: number; visibleLineRange?: EditorLineRange
  editableLineRange?: EditorLineRange; relativeLineNumbers?: boolean; onValidate?: OnValidate; onBlur?: () => void
  formatOnMount?: (value: string) => string | Promise<string>
  expressionContext?: boolean
  modelContext?: { prefix: string; suffix: string }
  readOnly?: boolean
  language?: "typescript" | "json"
}

export function QuizCodeEditor({ value, path, onChange, onSave, autoHeight = false, minHeight = 120, visibleLineRange, editableLineRange, relativeLineNumbers = false, onValidate, onBlur, formatOnMount, expressionContext = false, modelContext, readOnly = false, language = "typescript" }: QuizCodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const lockedRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const saveRef = useRef(onSave); saveRef.current = onSave
  const changeRef = useRef(onChange); changeRef.current = onChange
  const blurRef = useRef(onBlur); blurRef.current = onBlur
  const editableRef = useRef<EditorLineRange | undefined>(editableLineRange)
  const [height, setHeight] = useState(minHeight)
  const contextPrefix = modelContext?.prefix ?? (expressionContext ? "const __getgoExpression = (\n" : "")
  const contextSuffix = modelContext?.suffix ?? (expressionContext ? "\n)" : "")
  const contextOffset = contextPrefix.split("\n").length - 1
  const modelValue = `${contextPrefix}${value}${contextSuffix}`
  const modelVisibleRange = contextPrefix || contextSuffix
    ? { startLineNumber: contextOffset + 1, endLineNumber: contextOffset + value.split("\n").length }
    : visibleLineRange
  const modelEditableRange = editableLineRange && (contextPrefix || contextSuffix)
    ? { startLineNumber: editableLineRange.startLineNumber + contextOffset, endLineNumber: editableLineRange.endLineNumber + contextOffset }
    : editableLineRange
  editableRef.current = modelEditableRange
  const applyRanges = useCallback(() => {
    const editor = editorRef.current; const model = editor?.getModel(); if (!editor || !model) return
    const lineCount = model.getLineCount()
    const clampLine = (line: number) => Math.max(1, Math.min(lineCount, line))
    const visibleStart = modelVisibleRange ? clampLine(modelVisibleRange.startLineNumber) : 1
    const visibleEnd = modelVisibleRange ? clampLine(modelVisibleRange.endLineNumber) : lineCount
    const editableStart = modelEditableRange ? clampLine(modelEditableRange.startLineNumber) : visibleStart
    const editableEnd = modelEditableRange ? clampLine(modelEditableRange.endLineNumber) : visibleEnd
    const hidden: monaco.Range[] = []
    if (modelVisibleRange) {
      if (visibleStart > 1) hidden.push(new monaco.Range(1, 1, visibleStart - 1, model.getLineMaxColumn(visibleStart - 1)))
      if (visibleEnd < lineCount) hidden.push(new monaco.Range(visibleEnd + 1, 1, lineCount, model.getLineMaxColumn(lineCount)))
    }
    ;(editor as typeof editor & { setHiddenAreas(ranges: monaco.IRange[]): void }).setHiddenAreas(hidden)
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    if (modelVisibleRange && modelEditableRange) for (const [start, end] of [[visibleStart, editableStart - 1], [editableEnd + 1, visibleEnd]]) for (let line = start; line <= end; line += 1) decorations.push({ range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), options: { inlineClassName: "monaco-readonly-code" } })
    lockedRef.current ? lockedRef.current.set(decorations) : lockedRef.current = editor.createDecorationsCollection(decorations)
  }, [modelEditableRange, modelVisibleRange])
  const onMount = useCallback<OnMount>(editor => {
    editorRef.current = editor
    const mountedModel = editor.getModel()
    if (mountedModel && mountedModel.getValue() !== modelValue) mountedModel.setValue(modelValue)
    applyRanges(); editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    if (autoHeight) { const update = () => setHeight(Math.max(minHeight, editor.getContentHeight())); update(); editor.onDidContentSizeChange(update) }
    const updateReadOnly = () => { const range = editableRef.current; const selection = editor.getSelection(); editor.updateOptions({ readOnly: readOnly || (!!range && !(selection && selection.startLineNumber >= range.startLineNumber && selection.endLineNumber <= range.endLineNumber)) }) }
    if (editableRef.current) { const model = editor.getModel(); editor.setPosition({ lineNumber: Math.max(1, Math.min(model?.getLineCount() ?? 1, editableRef.current.startLineNumber)), column: 1 }); updateReadOnly(); editor.onDidChangeCursorSelection(updateReadOnly) }
    editor.onDidBlurEditorWidget(() => blurRef.current?.())
    if (formatOnMount) void Promise.resolve(formatOnMount(value)).then(formatted => { if (formatted !== value) changeRef.current(formatted) }).catch(() => { /* Invalid drafts remain editable. */ })
  }, [applyRanges, autoHeight, formatOnMount, minHeight, modelValue, readOnly, value])
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== modelValue) model.setValue(modelValue)
    applyRanges()
  }, [applyRanges, modelValue])
  const handleChange = (next = "") => {
    if (!contextPrefix && !contextSuffix) { onChange(next); return }
    const visible = visibleModelValue(next, contextPrefix, contextSuffix)
    if (visible !== null) onChange(visible)
  }
  // Keep overflow widgets anchored to Monaco's editor container. Do not set
  // `overflowWidgetsDomNode: document.body`: these editors live in auto-height,
  // scrollable panels, so a body host uses different coordinates and places
  // hover/signature/IntelliSense widgets far away from the editing cursor.
  return <Editor beforeMount={configureMonaco} onMount={onMount} value={modelValue} onChange={handleChange} onValidate={onValidate} language={language} path={`file:///${path.replaceAll("\\", "/")}`} height={autoHeight ? height : "100%"} theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light"} loading={<div className="editor-loading"><span />Loading editor and IntelliSense…</div>} options={{ automaticLayout: true, bracketPairColorization: { enabled: true }, fixedOverflowWidgets: true, fontSize: 13, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, lineNumbers: relativeLineNumbers && modelVisibleRange ? line => String(line - modelVisibleRange.startLineNumber + 1) : "on", padding: { top: 12, bottom: 12 }, readOnly, readOnlyMessage: { value: readOnly ? "This generated code is read-only." : "Only the function body can be edited." }, scrollBeyondLastLine: false, scrollbar: autoHeight ? { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false } : undefined, tabSize: 2, wordWrap: "on" }} />
}

export function QuizCodeDiffViewer({ original, modified, path }: { original: string; modified: string; path: string }) {
  const [diffHeight, setDiffHeight] = useState(160)
  const onDiffMount = useCallback<DiffOnMount>(editor => {
    const originalEditor = editor.getOriginalEditor()
    const modifiedEditor = editor.getModifiedEditor()
    const updateHeight = () => window.requestAnimationFrame(() => setDiffHeight(Math.max(160, originalEditor.getContentHeight(), modifiedEditor.getContentHeight())))
    updateHeight()
    originalEditor.onDidContentSizeChange(updateHeight)
    modifiedEditor.onDidContentSizeChange(updateHeight)
    editor.onDidUpdateDiff(updateHeight)
  }, [])
  return <DiffEditor beforeMount={configureMonaco} onMount={onDiffMount} original={original} modified={modified} originalModelPath={`file:///${path}-before.ts`} modifiedModelPath={`file:///${path}-after.ts`} language="typescript" height={diffHeight} theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light"} options={{ automaticLayout: true, fixedOverflowWidgets: true, fontSize: 12, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true, readOnly: true, renderSideBySide: true, scrollBeyondLastLine: false, scrollbar: { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false }, wordWrap: "on" }} />
}

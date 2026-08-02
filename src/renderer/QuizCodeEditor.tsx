import Editor, { loader, type OnMount, type OnValidate } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import * as monacoTypeScript from "monaco-editor/languages/features/typescript/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import { useCallback, useEffect, useRef, useState } from "react"
import quizBuilderTypes from "./quiz-builder.monaco.json"

self.MonacoEnvironment = { getWorker(_id, label) { if (label === "typescript" || label === "javascript") return new TypeScriptWorker(); if (label === "json") return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })

export interface EditorLineRange { startLineNumber: number; endLineNumber: number }
interface QuizCodeEditorProps {
  value: string; path: string; onChange(value: string): void; onSave(): void
  autoHeight?: boolean; minHeight?: number; visibleLineRange?: EditorLineRange
  editableLineRange?: EditorLineRange; relativeLineNumbers?: boolean; onValidate?: OnValidate; onBlur?: () => void
}

export function QuizCodeEditor({ value, path, onChange, onSave, autoHeight = false, minHeight = 120, visibleLineRange, editableLineRange, relativeLineNumbers = false, onValidate, onBlur }: QuizCodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const lockedRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const saveRef = useRef(onSave); saveRef.current = onSave
  const blurRef = useRef(onBlur); blurRef.current = onBlur
  const editableRef = useRef(editableLineRange); editableRef.current = editableLineRange
  const [height, setHeight] = useState(minHeight)
  const beforeMount = useCallback(() => {
    monacoTypeScript.typescriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, strict: true, noEmit: true, target: monacoTypeScript.ScriptTarget.ESNext, moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs, module: monacoTypeScript.ModuleKind.ESNext, lib: ["es2022", "dom"] })
    monacoTypeScript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
    for (const library of quizBuilderTypes.libraries) monacoTypeScript.typescriptDefaults.addExtraLib(library.content, library.filePath)
  }, [])
  const applyRanges = useCallback(() => {
    const editor = editorRef.current; const model = editor?.getModel(); if (!editor || !model) return
    const hidden: monaco.Range[] = []
    if (visibleLineRange) {
      if (visibleLineRange.startLineNumber > 1) hidden.push(new monaco.Range(1, 1, visibleLineRange.startLineNumber - 1, 1))
      if (visibleLineRange.endLineNumber < model.getLineCount()) hidden.push(new monaco.Range(visibleLineRange.endLineNumber + 1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())))
    }
    ;(editor as typeof editor & { setHiddenAreas(ranges: monaco.IRange[]): void }).setHiddenAreas(hidden)
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    if (visibleLineRange && editableLineRange) for (const [start, end] of [[visibleLineRange.startLineNumber, editableLineRange.startLineNumber - 1], [editableLineRange.endLineNumber + 1, visibleLineRange.endLineNumber]]) for (let line = start; line <= end; line += 1) decorations.push({ range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), options: { inlineClassName: "monaco-readonly-code" } })
    lockedRef.current ? lockedRef.current.set(decorations) : lockedRef.current = editor.createDecorationsCollection(decorations)
  }, [editableLineRange, visibleLineRange])
  const onMount = useCallback<OnMount>(editor => {
    editorRef.current = editor; applyRanges(); editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    if (autoHeight) { const update = () => setHeight(Math.max(minHeight, editor.getContentHeight())); update(); editor.onDidContentSizeChange(update) }
    const updateReadOnly = () => { const range = editableRef.current; const selection = editor.getSelection(); editor.updateOptions({ readOnly: !!range && !(selection && selection.startLineNumber >= range.startLineNumber && selection.endLineNumber <= range.endLineNumber) }) }
    if (editableRef.current) { editor.setPosition({ lineNumber: editableRef.current.startLineNumber, column: 1 }); updateReadOnly(); editor.onDidChangeCursorSelection(updateReadOnly) }
    editor.onDidBlurEditorWidget(() => blurRef.current?.())
  }, [applyRanges, autoHeight, minHeight])
  useEffect(() => { applyRanges() }, [applyRanges, value])
  return <Editor beforeMount={beforeMount} onMount={onMount} value={value} onChange={next => onChange(next ?? "")} onValidate={onValidate} language="typescript" path={`file:///${path.replaceAll("\\", "/")}`} height={autoHeight ? height : "100%"} theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light"} loading={<div className="editor-loading"><span />Loading editor and IntelliSense…</div>} options={{ automaticLayout: true, bracketPairColorization: { enabled: true }, fontSize: 13, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, lineNumbers: relativeLineNumbers && visibleLineRange ? line => String(line - visibleLineRange.startLineNumber + 1) : "on", padding: { top: 12, bottom: 12 }, readOnlyMessage: { value: "Only the function body can be edited." }, scrollBeyondLastLine: false, scrollbar: autoHeight ? { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false } : undefined, tabSize: 2, wordWrap: "on" }} />
}

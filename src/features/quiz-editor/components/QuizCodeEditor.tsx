import Editor, { DiffEditor, loader, type DiffOnMount, type OnMount, type OnValidate } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import * as monacoTypeScript from "monaco-editor/languages/features/typescript/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import { useCallback, useEffect, useRef, useState } from "react"
import quizBuilderTypes from "../../../shared/ui/quiz-builder.monaco.json"

self.MonacoEnvironment = { getWorker(_id, label) { if (label === "typescript" || label === "javascript") return new TypeScriptWorker(); if (label === "json") return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })

const editorExtraLibs = new Map<string, {
  content: string
  refs: number
  disposable: monaco.IDisposable
}>()
let qsProbeSequence = 0

async function probeQsExtraLib(editorPath: string, extraLib: EditorExtraLib): Promise<void> {
  const probeUri = monaco.Uri.parse(`file:///__getgo_qs_probe_${qsProbeSequence += 1}.ts`)
  const probe = monaco.editor.createModel("QS.", "typescript", probeUri)
  try {
    const factory = await monacoTypeScript.getTypeScriptWorker()
    const worker = await factory(probeUri)
    const completions = await worker.getCompletionsAtPosition(probeUri.toString(), 3)
    console.info("[GetGo Tools][Monaco QS probe]", {
      editorPath,
      extraLibPath: extraLib.filePath,
      libraryRegistered: Boolean(
        monacoTypeScript.typescriptDefaults.getExtraLibs()[extraLib.filePath],
      ),
      members: completions?.entries.map((entry: { name: string }) => entry.name) ?? [],
    })
  } catch (cause) {
    console.error("[GetGo Tools][Monaco QS probe][failed]", {
      editorPath,
      extraLibPath: extraLib.filePath,
      cause,
    })
  } finally {
    probe.dispose()
  }
}

function retainEditorExtraLib(extraLib: EditorExtraLib): () => void {
  let entry = editorExtraLibs.get(extraLib.filePath)
  if (!entry || entry.content !== extraLib.content) {
    entry?.disposable.dispose()
    entry = {
      content: extraLib.content,
      refs: 0,
      disposable: monacoTypeScript.typescriptDefaults.addExtraLib(
        extraLib.content,
        extraLib.filePath,
      ),
    }
    editorExtraLibs.set(extraLib.filePath, entry)
    console.info("[GetGo Tools][Monaco extra lib][registered]", {
      filePath: extraLib.filePath,
      contentLength: extraLib.content.length,
      definesQS: /\bconst\s+QS\b/.test(extraLib.content),
    })
  }
  entry.refs += 1
  console.info("[GetGo Tools][Monaco extra lib][retained]", {
    filePath: extraLib.filePath,
    refs: entry.refs,
  })
  const retained = entry
  return () => {
    if (editorExtraLibs.get(extraLib.filePath) !== retained) return
    retained.refs -= 1
    console.info("[GetGo Tools][Monaco extra lib][released]", {
      filePath: extraLib.filePath,
      refs: retained.refs,
    })
    if (retained.refs > 0) return
    retained.disposable.dispose()
    editorExtraLibs.delete(extraLib.filePath)
  }
}

function configureMonaco() {
  monacoTypeScript.typescriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, strict: true, strictNullChecks: false, noEmit: true, target: monacoTypeScript.ScriptTarget.ESNext, moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs, module: monacoTypeScript.ModuleKind.ESNext, lib: ["es2022", "dom"] })
  monacoTypeScript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [7006, 7031] })
  for (const library of quizBuilderTypes.libraries) monacoTypeScript.typescriptDefaults.addExtraLib(library.content, library.filePath)
}

export interface EditorLineRange { startLineNumber: number; endLineNumber: number }
export interface EditorExtraLib { content: string; filePath: string }
interface QuizCodeEditorProps {
  value: string; path: string; onChange(value: string): void; onSave(): void
  autoHeight?: boolean; minHeight?: number; visibleLineRange?: EditorLineRange
  editableLineRange?: EditorLineRange; relativeLineNumbers?: boolean; onValidate?: OnValidate; onBlur?: () => void
  formatOnMount?: (value: string) => string | Promise<string>
  extraLib?: EditorExtraLib
  readOnly?: boolean
  autoFocus?: boolean
  language?: "typescript" | "json"
}

export function QuizCodeEditor({ value, path, onChange, onSave, autoHeight = false, minHeight = 120, visibleLineRange, editableLineRange, relativeLineNumbers = false, onValidate, onBlur, formatOnMount, extraLib, readOnly = false, autoFocus = false, language = "typescript" }: QuizCodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const lockedRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const saveRef = useRef(onSave); saveRef.current = onSave
  const changeRef = useRef(onChange); changeRef.current = onChange
  const blurRef = useRef(onBlur); blurRef.current = onBlur
  const liveValueRef = useRef(value)
  const pendingLocalValueRef = useRef<string | null>(null)
  const applyingExternalValueRef = useRef(false)
  const editableRef = useRef<EditorLineRange | undefined>(editableLineRange)
  const extraLibRef = useRef<{ key: string; release: () => void } | null>(null)
  const [height, setHeight] = useState(minHeight)
  const modelValue = value
  const modelVisibleRange = visibleLineRange
  const modelEditableRange = editableLineRange
  editableRef.current = modelEditableRange
  const ensureExtraLib = useCallback(() => {
    const key = extraLib?.content.trim()
      ? `${extraLib.filePath}\u0000${extraLib.content}`
      : ""
    if (extraLibRef.current?.key === key) return
    extraLibRef.current?.release()
    extraLibRef.current = key && extraLib
      ? { key, release: retainEditorExtraLib(extraLib) }
      : null
  }, [extraLib?.content, extraLib?.filePath])
  const beforeMount = useCallback(() => {
    configureMonaco()
    ensureExtraLib()
    console.info("[GetGo Tools][Monaco editor][before mount]", {
      path,
      requestedExtraLib: extraLib?.filePath ?? null,
      registeredExtraLibs: Object.keys(monacoTypeScript.typescriptDefaults.getExtraLibs()),
    })
  }, [ensureExtraLib, extraLib?.filePath, path])
  useEffect(() => {
    ensureExtraLib()
    if (extraLib?.content.trim()) void probeQsExtraLib(path, extraLib)
    return () => {
      extraLibRef.current?.release()
      extraLibRef.current = null
    }
  }, [ensureExtraLib, extraLib?.content, extraLib?.filePath, path])
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
    const existingValue = mountedModel?.getValue() ?? ""
    const replacedOnMount = Boolean(mountedModel && existingValue !== modelValue)
    console.info("[GetGo Tools][Monaco model][mount]", {
      path,
      model: mountedModel?.uri.toString() ?? null,
      incomingLength: modelValue.length,
      existingLength: existingValue.length,
      incomingPreview: modelValue.slice(0, 120),
      existingPreview: existingValue.slice(0, 120),
      replacedOnMount,
    })
    if (mountedModel && replacedOnMount) mountedModel.setValue(modelValue)
    if (autoFocus && !readOnly) editor.focus()
    applyRanges(); window.requestAnimationFrame(applyRanges); editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    if (autoHeight) { const update = () => setHeight(Math.max(minHeight, editor.getContentHeight())); update(); editor.onDidContentSizeChange(update) }
    const updateReadOnly = () => { const range = editableRef.current; const selection = editor.getSelection(); editor.updateOptions({ readOnly: readOnly || (!!range && !(selection && selection.startLineNumber >= range.startLineNumber && selection.endLineNumber <= range.endLineNumber)) }) }
    if (editableRef.current) { const model = editor.getModel(); editor.setPosition({ lineNumber: Math.max(1, Math.min(model?.getLineCount() ?? 1, editableRef.current.startLineNumber)), column: 1 }); updateReadOnly(); editor.onDidChangeCursorSelection(updateReadOnly) }
    editor.onDidBlurEditorWidget(() => blurRef.current?.())
    if (formatOnMount) {
      const valueAtFormatStart = value
      void Promise.resolve(formatOnMount(valueAtFormatStart)).then(formatted => {
        if (
          formatted !== valueAtFormatStart
          && liveValueRef.current === valueAtFormatStart
        ) {
          const model = editor.getModel()
          if (!model) return
          applyingExternalValueRef.current = true
          try {
            editor.executeEdits("format-on-mount", [{
              range: model.getFullModelRange(),
              text: formatted,
              forceMoveMarkers: true,
            }])
          } finally {
            applyingExternalValueRef.current = false
          }
          liveValueRef.current = formatted
          pendingLocalValueRef.current = formatted
          changeRef.current(formatted)
        }
      }).catch(() => { /* Invalid drafts remain editable. */ })
    }
  }, [applyRanges, autoFocus, autoHeight, formatOnMount, minHeight, modelValue, path, readOnly, value])
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    const currentValue = model.getValue()
    if (currentValue === modelValue) {
      liveValueRef.current = modelValue
      if (pendingLocalValueRef.current === modelValue)
        pendingLocalValueRef.current = null
    } else if (pendingLocalValueRef.current === null) {
      console.info("[GetGo Tools][Monaco model][prop sync]", {
        path,
        model: model.uri.toString(),
        incomingLength: modelValue.length,
        existingLength: currentValue.length,
        incomingPreview: modelValue.slice(0, 120),
        existingPreview: currentValue.slice(0, 120),
      })
      const selectionOffsets = editor.getSelections()?.map(selection => ({
        start: model.getOffsetAt(selection.getStartPosition()),
        end: model.getOffsetAt(selection.getEndPosition()),
      })) ?? []
      applyingExternalValueRef.current = true
      try {
        editor.executeEdits("external-prop-sync", [{
          range: model.getFullModelRange(),
          text: modelValue,
          forceMoveMarkers: true,
        }])
      } finally {
        applyingExternalValueRef.current = false
      }
      liveValueRef.current = modelValue
      const nextLength = model.getValueLength()
      if (selectionOffsets.length) editor.setSelections(selectionOffsets.map(offsets => {
        const start = model.getPositionAt(Math.min(offsets.start, nextLength))
        const end = model.getPositionAt(Math.min(offsets.end, nextLength))
        return new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column)
      }))
    }
    applyRanges()
  }, [applyRanges, modelValue])
  const handleChange = (next = "") => {
    liveValueRef.current = next
    if (applyingExternalValueRef.current) return
    pendingLocalValueRef.current = next
    onChange(next)
  }
  // Keep overflow widgets anchored to Monaco's editor container. Do not set
  // `overflowWidgetsDomNode: document.body`: these editors live in auto-height,
  // scrollable panels, so a body host uses different coordinates and places
  // hover/signature/IntelliSense widgets far away from the editing cursor.
  return <Editor beforeMount={beforeMount} onMount={onMount} defaultValue={modelValue} onChange={handleChange} onValidate={onValidate} language={language} path={`file:///${path.replaceAll("\\", "/")}`} height={autoHeight ? height : "100%"} theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light"} loading={<div className="editor-loading"><span />Loading editor and IntelliSense…</div>} options={{ automaticLayout: true, bracketPairColorization: { enabled: true }, fixedOverflowWidgets: true, folding: true, foldingStrategy: "indentation", showFoldingControls: "always", fontSize: 13, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, lineNumbers: relativeLineNumbers && modelVisibleRange ? line => String(line - modelVisibleRange.startLineNumber + 1) : "on", padding: { top: 12, bottom: 12 }, readOnly, readOnlyMessage: { value: readOnly ? "This generated code is read-only." : "Only the function body can be edited." }, scrollBeyondLastLine: false, scrollbar: autoHeight ? { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false } : undefined, tabSize: 2, wordWrap: "on" }} />
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

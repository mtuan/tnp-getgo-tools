import Editor, { DiffEditor, loader, type DiffOnMount, type OnMount, type OnValidate } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import * as monacoTypeScript from "monaco-editor/languages/features/typescript/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import { useCallback, useEffect, useRef, useState } from "react"
import quizBuilderTypes from "../../../shared/ui/quiz-builder.monaco.json"
import { useSystemDarkMode } from "../../../shared/ui/useSystemDarkMode"
import { declarationDetailsAt, type DeclarationDetails } from "../domain/declaration-details"
import {
  dynamicEditorValueFromModel,
  editorModelHasExtraEnvelopes,
} from "../domain/question-dynamics"
import { DeclarationDetailsDialog } from "./DeclarationDetailsDialog"

self.MonacoEnvironment = { getWorker(_id, label) { if (label === "typescript" || label === "javascript") return new TypeScriptWorker(); if (label === "json") return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })

const editorExtraLibs = new Map<string, {
  content: string
  refs: number
  replaceGroup?: string
  disposable: monaco.IDisposable
}>()
const quizBuilderExtraLibs = new Map<string, monaco.IDisposable>()
const quizBuilderCompatibilityTypes = [{
  filePath: "file:///node_modules/@tnp/getgo-logics/quiz-builder/MathsHelper.bounded-sequence.d.ts",
  content: `import { MathsHelper } from "./MathsHelper.js";
import { NumberSequence } from "./NumberSequence.js";
declare module "./MathsHelper.js" {
  interface MathsHelper {
    /**
     * Create a bounded arithmetic sequence from start through an inclusive end.
     * The final term never passes end. Use a negative step when descending.
     * @example QB.maths.sequence(1, 2, 7).toArray() // [1, 3, 5, 7]
     */
    sequence(start: number, step: number, end: number): NumberSequence;
  }
}
declare module "./NumberSequence.js" {
  interface NumberSequence {
    /** Show leading and trailing terms, collapsing the middle when needed. */
    toText(options: { start?: number; end?: number; ellipsis?: string }): string;
  }
}
export { MathsHelper };`,
}, {
  filePath: "file:///node_modules/@tnp/getgo-logics/quiz-builder/RandomHelper.parity.d.ts",
  content: `import { RandomHelper } from "./RandomHelper.js";
declare module "./RandomHelper.js" {
  interface RandomIntOptions {
    /** Return only odd values. */
    odd?: boolean;
    /** Return only even values. */
    even?: boolean;
  }
}
export { RandomHelper };`,
}]

function quizBuilderLibraries() {
  return [...quizBuilderTypes.libraries, ...quizBuilderCompatibilityTypes]
}
// Monaco bundles TypeScript's `ModuleDetectionKind.Force` but does not expose
// that enum through its public registration module.
const FORCE_MODULE_DETECTION = 3
let qsProbeSequence = 0

function displayPartsText(parts: readonly { text: string }[] | undefined): string {
  return parts?.map(part => part.text).join("") ?? ""
}

function diagnosticMessageText(message: unknown): string {
  if (typeof message === "string") return message
  if (!message || typeof message !== "object") return String(message)
  const value = message as { messageText?: unknown; next?: unknown[] }
  return [
    diagnosticMessageText(value.messageText),
    ...(value.next ?? []).map(diagnosticMessageText),
  ].filter(Boolean).join(" ")
}

async function probeQuizBuilderIntellisense(
  model: monaco.editor.ITextModel,
  editorPath: string,
  trigger: "mount" | "focus" | "edit",
  userSourceOffset: number,
): Promise<void> {
  ensureQuizBuilderExtraLibs()
  const source = model.getValue()
  const userQbOffset = source.slice(userSourceOffset).search(/\bQB\b/)
  const qbOffset = userQbOffset >= 0
    ? userSourceOffset + userQbOffset
    : source.search(/\bQB\b/)
  const registered = monacoTypeScript.typescriptDefaults.getExtraLibs()
  const missingQuizBuilderLibraries = quizBuilderLibraries()
    .filter(library => registered[library.filePath]?.content !== library.content)
    .map(library => library.filePath)

  if (qbOffset < 0) {
    console.warn("[GetGo Tools][Monaco QB IntelliSense][QB absent]", {
      editorPath,
      model: model.uri.toString(),
      trigger,
      registeredLibraryCount: quizBuilderLibraries().length,
      missingQuizBuilderLibraries,
    })
    return
  }

  try {
    const factory = await monacoTypeScript.getTypeScriptWorker()
    const worker = await factory(model.uri)
    const quickInfo = await worker.getQuickInfoAtPosition(
      model.uri.toString(),
      qbOffset + 1,
    )
    const completions = await worker.getCompletionsAtPosition(
      model.uri.toString(),
      qbOffset + 3,
    )
    const diagnostics = await worker.getSemanticDiagnostics(model.uri.toString())
    const resolvedType = displayPartsText(quickInfo?.displayParts)
    const members = completions?.entries.map((entry: { name: string }) => entry.name) ?? []
    const payload = {
      editorPath,
      model: model.uri.toString(),
      trigger,
      resolvedType,
      resolvesToAny: /:\s*any\b/.test(resolvedType),
      memberCount: members.length,
      sampleMembers: members.slice(0, 20),
      registeredLibraryCount: quizBuilderLibraries().length,
      missingQuizBuilderLibraries,
      diagnostics: diagnostics.map(diagnostic => ({
        code: diagnostic.code,
        start: diagnostic.start,
        length: diagnostic.length,
        message: diagnosticMessageText(diagnostic.messageText),
      })),
    }
    if (!quickInfo || payload.resolvesToAny || members.length === 0)
      console.error("[GetGo Tools][Monaco QB IntelliSense][failed]", payload)
    else
      console.info("[GetGo Tools][Monaco QB IntelliSense][working]", payload)
  } catch (cause) {
    console.error("[GetGo Tools][Monaco QB IntelliSense][probe error]", {
      editorPath,
      model: model.uri.toString(),
      trigger,
      registeredLibraryCount: quizBuilderLibraries().length,
      missingQuizBuilderLibraries,
      cause,
    })
  }
}

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
  if (extraLib.replaceGroup) {
    for (const [filePath, candidate] of editorExtraLibs) {
      if (
        filePath !== extraLib.filePath
        && candidate.replaceGroup === extraLib.replaceGroup
      ) {
        candidate.disposable.dispose()
        editorExtraLibs.delete(filePath)
      }
    }
  }
  let entry = editorExtraLibs.get(extraLib.filePath)
  if (!entry || entry.content !== extraLib.content) {
    entry?.disposable.dispose()
    entry = {
      content: extraLib.content,
      refs: 0,
      replaceGroup: extraLib.replaceGroup,
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

function ensureQuizBuilderExtraLibs(): void {
  const registered = monacoTypeScript.typescriptDefaults.getExtraLibs()
  for (const library of quizBuilderLibraries()) {
    if (registered[library.filePath]?.content === library.content) continue
    quizBuilderExtraLibs.get(library.filePath)?.dispose()
    quizBuilderExtraLibs.set(
      library.filePath,
      monacoTypeScript.typescriptDefaults.addExtraLib(
        library.content,
        library.filePath,
      ),
    )
  }
}

function configureMonaco() {
  // Every editor model belongs to one question fragment. Force module scope so
  // declarations in a cached/open model cannot shadow globals (especially QB)
  // or leak into another question's IntelliSense project.
  monacoTypeScript.typescriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, strict: true, strictNullChecks: false, noEmit: true, target: monacoTypeScript.ScriptTarget.ESNext, moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs, module: monacoTypeScript.ModuleKind.ESNext, moduleDetection: FORCE_MODULE_DETECTION, lib: ["es2022", "dom"] })
  monacoTypeScript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [7006, 7031] })
  ensureQuizBuilderExtraLibs()
}

export interface EditorLineRange { startLineNumber: number; endLineNumber: number }
export interface EditorExtraLib {
  content: string
  filePath: string
  replaceGroup?: string
}
interface QuizCodeEditorProps {
  value: string; path: string; onChange(value: string): void; onSave(): void
  autoHeight?: boolean; minHeight?: number; visibleLineRange?: EditorLineRange
  editableLineRange?: EditorLineRange; relativeLineNumbers?: boolean; onValidate?: OnValidate; onBlur?: () => void; onFocus?: () => void
  formatOnMount?: (value: string) => string | Promise<string>
  extraLib?: EditorExtraLib
  /** Type-only source prepended to this Monaco model and hidden from the editor. */
  modelContext?: string
  /** Closing source for modelContext, also hidden and never persisted. */
  modelContextSuffix?: string
  readOnly?: boolean
  autoFocus?: boolean
  language?: "typescript" | "json"
}

export function QuizCodeEditor({ value, path, onChange, onSave, autoHeight = false, minHeight = 120, visibleLineRange, editableLineRange, relativeLineNumbers = false, onValidate, onBlur, onFocus, formatOnMount, extraLib, modelContext = "", modelContextSuffix = "", readOnly = false, autoFocus = false, language = "typescript" }: QuizCodeEditorProps) {
  const isDarkMode = useSystemDarkMode()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const lockedRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const saveRef = useRef(onSave); saveRef.current = onSave
  const changeRef = useRef(onChange); changeRef.current = onChange
  const blurRef = useRef(onBlur); blurRef.current = onBlur
  const focusRef = useRef(onFocus); focusRef.current = onFocus
  const normalizedModelContext = modelContext.trim()
    ? `${modelContext.trimEnd()}\n`
    : ""
  const normalizedModelContextSuffix = modelContextSuffix.trim()
    ? `\n${modelContextSuffix.trimStart()}`
    : ""
  const contextLineOffset = normalizedModelContext
    ? normalizedModelContext.split("\n").length - 1
    : 0
  const liveValueRef = useRef(`${normalizedModelContext}${value}${normalizedModelContextSuffix}`)
  const pendingLocalValueRef = useRef<string | null>(null)
  const applyingExternalValueRef = useRef(false)
  const editableRef = useRef<EditorLineRange | undefined>(editableLineRange)
  const extraLibRef = useRef<{ key: string; release: () => void } | null>(null)
  const formattedLineSourceRef = useRef(value)
  const qbProbeTimerRef = useRef<number | null>(null)
  const declarationOpenerRef = useRef<monaco.IDisposable | null>(null)
  const [declarationDetails, setDeclarationDetails] = useState<DeclarationDetails | null>(null)
  const [height, setHeight] = useState(minHeight)
  const [formattedLineDelta, setFormattedLineDelta] = useState(0)
  const modelValue = `${normalizedModelContext}${value}${normalizedModelContextSuffix}`
  const modelVisibleRange = visibleLineRange
    ? { ...visibleLineRange, endLineNumber: Math.max(visibleLineRange.startLineNumber, visibleLineRange.endLineNumber + formattedLineDelta) }
    : undefined
  const modelEditableRange = editableLineRange
    ? { ...editableLineRange, endLineNumber: Math.max(editableLineRange.startLineNumber, editableLineRange.endLineNumber + formattedLineDelta) }
    : undefined
  editableRef.current = modelEditableRange
    ? {
        startLineNumber: modelEditableRange.startLineNumber + contextLineOffset,
        endLineNumber: modelEditableRange.endLineNumber + contextLineOffset,
      }
    : undefined
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
  useEffect(() => {
    if (formattedLineSourceRef.current === value) return
    formattedLineSourceRef.current = value
    setFormattedLineDelta(0)
  }, [value])
  const applyRanges = useCallback(() => {
    const editor = editorRef.current; const model = editor?.getModel(); if (!editor || !model) return
    const lineCount = model.getLineCount()
    const clampLine = (line: number) => Math.max(1, Math.min(lineCount, line))
    const maxColumn = (line: number) => model.getLineMaxColumn(clampLine(line))
    const shiftLine = (line: number) => line + contextLineOffset
    const visibleStart = modelVisibleRange ? clampLine(shiftLine(modelVisibleRange.startLineNumber)) : clampLine(contextLineOffset + 1)
    const visibleEnd = modelVisibleRange ? clampLine(shiftLine(modelVisibleRange.endLineNumber)) : lineCount
    const editableStart = modelEditableRange ? clampLine(shiftLine(modelEditableRange.startLineNumber)) : visibleStart
    const editableEnd = modelEditableRange ? clampLine(shiftLine(modelEditableRange.endLineNumber)) : visibleEnd
    const hidden: monaco.Range[] = []
    if (contextLineOffset > 0) {
      const contextEnd = clampLine(contextLineOffset)
      hidden.push(new monaco.Range(1, 1, contextEnd, maxColumn(contextEnd)))
    }
    if (modelVisibleRange) {
      if (visibleStart > contextLineOffset + 1)
        hidden.push(new monaco.Range(clampLine(contextLineOffset + 1), 1, clampLine(visibleStart - 1), maxColumn(visibleStart - 1)))
      if (visibleEnd < lineCount) hidden.push(new monaco.Range(clampLine(visibleEnd + 1), 1, lineCount, maxColumn(lineCount)))
    }
    ;(editor as typeof editor & { setHiddenAreas(ranges: monaco.IRange[]): void }).setHiddenAreas(hidden)
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    if (modelVisibleRange && modelEditableRange) for (const [start, end] of [[visibleStart, editableStart - 1], [editableEnd + 1, visibleEnd]]) for (let line = Math.max(1, start); line <= Math.min(lineCount, end); line += 1) decorations.push({ range: new monaco.Range(line, 1, line, maxColumn(line)), options: { inlineClassName: "monaco-readonly-code" } })
    lockedRef.current ? lockedRef.current.set(decorations) : lockedRef.current = editor.createDecorationsCollection(decorations)
    if (autoHeight) window.requestAnimationFrame(() =>
      setHeight(Math.max(minHeight, editor.getContentHeight())),
    )
  }, [autoHeight, contextLineOffset, minHeight, modelEditableRange, modelVisibleRange])
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
    if (mountedModel && replacedOnMount) {
      applyingExternalValueRef.current = true
      try {
        mountedModel.setValue(modelValue)
      } finally {
        applyingExternalValueRef.current = false
      }
      liveValueRef.current = modelValue
      pendingLocalValueRef.current = null
    }
    declarationOpenerRef.current?.dispose()
    declarationOpenerRef.current = monaco.editor.registerEditorOpener({
      openCodeEditor(source, resource, selectionOrPosition) {
        if (source !== editor) return false
        const resourcePath = resource.toString()
        const library = quizBuilderLibraries().find(
          (candidate) => candidate.filePath === resourcePath,
        )
        const retainedLibrary = editorExtraLibs.get(resourcePath)
        const content = library?.content ?? retainedLibrary?.content
        if (!content) return false
        setDeclarationDetails(declarationDetailsAt(
          resourcePath,
          content,
          selectionOrPosition
            ? ("lineNumber" in selectionOrPosition
                ? selectionOrPosition.lineNumber
                : selectionOrPosition.startLineNumber)
            : 1,
        ))
        return true
      },
    })
    if (mountedModel && language === "typescript")
      void probeQuizBuilderIntellisense(
        mountedModel,
        path,
        "mount",
        normalizedModelContext.length,
      )
    if (autoFocus && !readOnly) editor.focus()
    applyRanges(); window.requestAnimationFrame(applyRanges); editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    if (autoHeight) { const update = () => setHeight(Math.max(minHeight, editor.getContentHeight())); update(); editor.onDidContentSizeChange(update) }
    const updateReadOnly = () => { const range = editableRef.current; const selection = editor.getSelection(); editor.updateOptions({ readOnly: readOnly || (!!range && !(selection && selection.startLineNumber >= range.startLineNumber && selection.endLineNumber <= range.endLineNumber)) }) }
    if (editableRef.current) { const model = editor.getModel(); editor.setPosition({ lineNumber: Math.max(1, Math.min(model?.getLineCount() ?? 1, editableRef.current.startLineNumber)), column: 1 }); updateReadOnly(); editor.onDidChangeCursorSelection(updateReadOnly) }
    // Text focus is the reliable boundary when moving directly between separate
    // Monaco instances. Widget blur can remain false while Monaco transfers its
    // global editor focus, leaving dependent code signatures stale.
    editor.onDidBlurEditorText(() => {
      console.info("[GetGo Tools][Monaco focus][blur]", {
        path,
        valueLength: editor.getModel()?.getValueLength() ?? 0,
      })
      blurRef.current?.()
    })
    editor.onDidFocusEditorText(() => {
      // Monaco may recreate its TypeScript worker after model or tab changes.
      // Reassert the canonical declaration files before serving completions.
      ensureQuizBuilderExtraLibs()
      console.info("[GetGo Tools][Monaco focus][focus]", {
        path,
        valueLength: editor.getModel()?.getValueLength() ?? 0,
      })
      const model = editor.getModel()
      if (model && language === "typescript")
        void probeQuizBuilderIntellisense(
          model,
          path,
          "focus",
          normalizedModelContext.length,
        )
      focusRef.current?.()
    })
    editor.onDidChangeModelContent(() => {
      if (language !== "typescript") return
      if (qbProbeTimerRef.current !== null)
        window.clearTimeout(qbProbeTimerRef.current)
      qbProbeTimerRef.current = window.setTimeout(() => {
        qbProbeTimerRef.current = null
        const model = editor.getModel()
        if (model)
          void probeQuizBuilderIntellisense(
            model,
            path,
            "edit",
            normalizedModelContext.length,
          )
      }, 600)
    })
    if (formatOnMount) {
      const valueAtFormatStart = value
      void Promise.resolve(formatOnMount(valueAtFormatStart)).then(formatted => {
        if (
          formatted !== valueAtFormatStart
          && liveValueRef.current === `${normalizedModelContext}${valueAtFormatStart}${normalizedModelContextSuffix}`
        ) {
          const model = editor.getModel()
          if (!model) return
          const start = model.getPositionAt(normalizedModelContext.length)
          const end = model.getPositionAt(
            normalizedModelContext.length + valueAtFormatStart.length,
          )
          applyingExternalValueRef.current = true
          try {
            editor.executeEdits("format-on-mount", [{
              range: new monaco.Range(
                start.lineNumber,
                start.column,
                end.lineNumber,
                end.column,
              ),
              text: formatted,
              forceMoveMarkers: true,
            }])
          } finally {
            applyingExternalValueRef.current = false
          }
          const formattedModelValue = `${normalizedModelContext}${formatted}${normalizedModelContextSuffix}`
          liveValueRef.current = formattedModelValue
          pendingLocalValueRef.current = formattedModelValue
          formattedLineSourceRef.current = valueAtFormatStart
          setFormattedLineDelta(
            formatted.split("\n").length - valueAtFormatStart.split("\n").length,
          )
          // Formatting performed while mounting is presentational. Persist it
          // only after the user actually edits the model; otherwise merely
          // opening the Dynamic tab incorrectly marks the question as dirty.
        }
      }).catch(() => { /* Invalid drafts remain editable. */ })
    }
  }, [applyRanges, autoFocus, autoHeight, formatOnMount, language, minHeight, modelValue, normalizedModelContext, normalizedModelContextSuffix, path, readOnly, value])
  useEffect(() => () => {
    if (qbProbeTimerRef.current !== null)
      window.clearTimeout(qbProbeTimerRef.current)
    declarationOpenerRef.current?.dispose()
    declarationOpenerRef.current = null
  }, [])
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    const currentValue = model.getValue()
    if (currentValue === modelValue) {
      liveValueRef.current = modelValue
      if (pendingLocalValueRef.current === modelValue)
        pendingLocalValueRef.current = null
    } else if (
      pendingLocalValueRef.current === null
      || editorModelHasExtraEnvelopes(currentValue, modelValue)
    ) {
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
      pendingLocalValueRef.current = null
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
    onChange(dynamicEditorValueFromModel(
      next,
      normalizedModelContext,
      normalizedModelContextSuffix,
    ))
  }
  const handleValidate: OnValidate | undefined = onValidate
    ? (markers) => onValidate(markers
        .filter((marker) => (
          marker.endLineNumber > contextLineOffset
          && marker.startLineNumber <= contextLineOffset + (modelVisibleRange?.endLineNumber ?? value.split("\n").length)
        ))
        .map((marker) => ({
          ...marker,
          startLineNumber: Math.max(1, marker.startLineNumber - contextLineOffset),
          endLineNumber: Math.max(1, marker.endLineNumber - contextLineOffset),
        })))
    : undefined
  // Keep overflow widgets anchored to Monaco's editor container. Do not set
  // `overflowWidgetsDomNode: document.body`: these editors live in auto-height,
  // scrollable panels, so a body host uses different coordinates and places
  // hover/signature/IntelliSense widgets far away from the editing cursor.
  return <><Editor beforeMount={beforeMount} onMount={onMount} defaultValue={modelValue} onChange={handleChange} onValidate={handleValidate} language={language} path={`file:///${path.replaceAll("\\", "/")}`} height={autoHeight ? height : "100%"} theme={isDarkMode ? "vs-dark" : "light"} loading={<div className="editor-loading"><span />Loading editor and IntelliSense…</div>} options={{ automaticLayout: true, bracketPairColorization: { enabled: true }, fixedOverflowWidgets: true, folding: true, foldingStrategy: "indentation", showFoldingControls: "always", fontSize: 13, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, lineNumbers: relativeLineNumbers && modelVisibleRange ? line => String(line - contextLineOffset - modelVisibleRange.startLineNumber + 1) : "on", padding: { top: 12, bottom: 12 }, readOnly, readOnlyMessage: { value: readOnly ? "This generated code is read-only." : "Only the function body can be edited." }, scrollBeyondLastLine: false, scrollbar: autoHeight ? { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false } : undefined, tabSize: 2, wordWrap: "on" }} />{declarationDetails && <DeclarationDetailsDialog details={declarationDetails} onClose={() => setDeclarationDetails(null)} />}</>
}

export function QuizCodeDiffViewer({ original, modified, path }: { original: string; modified: string; path: string }) {
  const isDarkMode = useSystemDarkMode()
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
  return <DiffEditor beforeMount={configureMonaco} onMount={onDiffMount} original={original} modified={modified} originalModelPath={`file:///${path}-before.ts`} modifiedModelPath={`file:///${path}-after.ts`} language="typescript" height={diffHeight} theme={isDarkMode ? "vs-dark" : "light"} options={{ automaticLayout: true, fixedOverflowWidgets: true, fontSize: 12, fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace", minimap: { enabled: false }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true, readOnly: true, renderSideBySide: true, scrollBeyondLastLine: false, scrollbar: { vertical: "hidden", verticalScrollbarSize: 0, handleMouseWheel: false }, wordWrap: "on" }} />
}

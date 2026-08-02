import Editor, { loader, type OnMount } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import * as monacoTypeScript from "monaco-editor/languages/features/typescript/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker"
import { useCallback, useRef } from "react"
import quizBuilderTypes from "./quiz-builder.monaco.json"

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "typescript" || label === "javascript") return new TypeScriptWorker()
    if (label === "json") return new JsonWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

interface QuizCodeEditorProps {
  value: string
  path: string
  onChange(value: string): void
  onSave(): void
}

export function QuizCodeEditor({ value, path, onChange, onSave }: QuizCodeEditorProps) {
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const beforeMount = useCallback(() => {
    monacoTypeScript.typescriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
      target: monacoTypeScript.ScriptTarget.ESNext,
      moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs,
      module: monacoTypeScript.ModuleKind.ESNext,
      lib: ["es2022", "dom"],
    })
    for (const library of quizBuilderTypes.libraries) {
      monacoTypeScript.typescriptDefaults.addExtraLib(library.content, library.filePath)
    }
  }, [])

  const onMount = useCallback<OnMount>((editor) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current())
    editor.focus()
  }, [])

  return <Editor
    beforeMount={beforeMount}
    onMount={onMount}
    value={value}
    onChange={(next) => onChange(next ?? "")}
    language="typescript"
    path={`file:///${path.replaceAll("\\", "/")}`}
    theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light"}
    loading={<div className="editor-loading"><span />Loading editor and IntelliSense…</div>}
    options={{
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace",
      fontLigatures: true,
      minimap: { enabled: true, scale: 1 },
      padding: { top: 14, bottom: 14 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      wordWrap: "on",
      suggest: { showWords: true },
    }}
  />
}

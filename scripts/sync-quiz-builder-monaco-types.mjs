import { access, copyFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const installedSource = resolve(
  root,
  "node_modules/@tnp/getgo-logics/generated/quiz-builder.monaco.json",
)
const workspaceSource = resolve(
  root,
  "../tnp-getgo-logics/generated/quiz-builder.monaco.json",
)
const source = await access(workspaceSource).then(
  () => workspaceSource,
  () => installedSource,
)
const destination = resolve(root, "src/shared/ui/quiz-builder.monaco.json")

await copyFile(source, destination)
console.log(`Synchronized Monaco QuizBuilder declarations from ${source}`)

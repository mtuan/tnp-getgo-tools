import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

// Vendored logics can change without its version/file name changing on merge.
// Include its content in Vite's dependency hash (and browser import URLs).
const logicsBuildHash = createHash("sha256")
  .update(readFileSync(new URL("./vendor/tnp-getgo-logics-0.7.13.tgz", import.meta.url)))
  .digest("hex")

const browserEnvironmentDefines = {
  "__GETGO_LOGICS_BUILD_HASH__": JSON.stringify(logicsBuildHash),
  "process.env.BABEL_TYPES_8_BREAKING": "false",
  "process.env.PRETTIER_DEBUG": "false",
  "process.env.PRETTIER_EXPERIMENTAL_CLI": "false",
  "process.env.SUCRASE_OPTIONS": "undefined",
  "process.env.__MINIMATCH_TESTING_PLATFORM__": "undefined",
}

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  // The shared authoring package is browser-safe, but Babel/Prettier retain
  // compile-time Node environment probes in their distributed ESM. Replace
  // only those probes; do not expose or polyfill Electron's `process` global.
  define: browserEnvironmentDefines,
  optimizeDeps: { esbuildOptions: { define: browserEnvironmentDefines } },
  worker: {
    // The dynamic-question worker imports the shared authoring runtime, which
    // Rollup splits into multiple chunks. ES workers support that split while
    // Vite's IIFE worker default does not.
    format: "es",
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("monaco-editor") || id.includes("@monaco-editor")) return "monaco"
          if (id.includes("@tnp/getgo-logics") || id.includes("@babel/parser") || id.includes("sucrase") || id.includes("mathjs") || id.includes("prettier")) return "quiz-authoring"
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("canvg")) return "pdf"
          if (id.includes("katex") || id.includes("react-markdown") || id.includes("remark-")) return "rich-text"
          if (id.includes("react") || id.includes("scheduler")) return "react"
          return undefined
        },
      },
    },
  },
})

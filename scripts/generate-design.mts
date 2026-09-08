import { config as loadEnvironment } from "dotenv"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DesignAiGenerator } from "../src/features/design-projects/main/design-ai.ts"
import { DesignProjectService } from "../src/features/design-projects/main/design-project-service.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
loadEnvironment({ path: path.join(root, ".env.example") })
loadEnvironment({ path: path.join(root, ".env"), override: true })

const value = (flag: string) => {
  const index = process.argv.indexOf(flag)
  const result = index >= 0 ? process.argv[index + 1]?.trim() : undefined
  if (!result) throw new Error(`Missing ${flag}.`)
  return result
}

const option = (flag:string) => { const index=process.argv.indexOf(flag); return index>=0?process.argv[index+1]?.trim():undefined }

const run = async () => {
  const projectId = value("--project")
  const name = value("--name")
  const prompt = value("--prompt")
  const mode = option("--mode") ?? "page"
  if (mode !== "page" && mode !== "demo" && mode !== "reference") throw new Error("Invalid --mode. Use page, demo, or reference.")
  const webRoot = path.resolve(process.env.GETGO_WEB_ROOT || path.join(root, "..", "tnp-getgo-web"))
  const designs = new DesignProjectService(path.join(webRoot, "docs", "designs", "projects"))
  const runId = randomUUID()
  const startedAt = new Date()
  const stages:Array<{name:string;status:"passed"|"failed"|"skipped";details:string;elapsedMs:number}> = []
  const report = async (status:"running"|"passed"|"failed", result?:unknown, error?:unknown) => designs.writeGenerationRun(projectId,runId,{schemaVersion:1,runId,source:"cli",mode,status,projectId,pageName:name,prompt,startedAt:startedAt.toISOString(),completedAt:status==="running"?null:new Date().toISOString(),elapsedMs:Date.now()-startedAt.getTime(),stages,result:error?undefined:result,error:error?{message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined}:undefined})
  await report("running")
  const stage = async <T>(name:string,action:()=>Promise<T>) => {const began=Date.now();try{const result=await action();const details=name==="load-art-direction"?"Loaded the complete required art-direction.md contract.":name==="resolve-selected-page-analysis"?(mode==="demo"?"Demo mode confirmed: no Screenshot Manager, pages.json, screenshot, or DOM input was used.":"Resolved only the selected page records from analysis/pages.json."):name==="openai-generate-and-validate"?"OpenAI returned one four-variant page package; schema, semantic actions, theme parity, HTML restrictions, and PNG alpha passed deterministic validation.":name==="persist-and-render-package"?"Saved canonical JSON, assets, four HTML files, and four HTML-rendered demo PNGs.":"Loaded and validated the selected design project.";stages.push({name,status:"passed",details,elapsedMs:Date.now()-began});await report("running");return result;}catch(error){stages.push({name,status:"failed",details:error instanceof Error?error.message:String(error),elapsedMs:Date.now()-began});throw error;}}
  try {
  const project = await stage("load-design-project",()=>designs.load(projectId))
  const artDirection = await stage("load-art-direction",()=>designs.loadArtDirection(projectId))
  if (mode === "page" && !project.references.length) throw new Error("Page mode requires a Screenshot Manager analysis reference. Use --mode demo for prompt-only generation.")
  const analyses = mode === "demo" ? await stage("resolve-selected-page-analysis",async()=>[]) : await stage("resolve-selected-page-analysis",()=>Promise.all(project.references.map(async reference => {
    const sourceRoot = path.join(webRoot, "docs", "screenshots", "projects", reference.screenshotProjectId)
    const metadata = JSON.parse(await readFile(path.join(sourceRoot, "project.json"), "utf8")) as { analysis?:{generalRulesFile:string;structureLibraryFile:string;pagesFile:string};screenshots:Array<{id:string;route:string}> }
    if (!metadata.analysis || metadata.analysis.generalRulesFile !== "analysis/general-rules.md" || metadata.analysis.structureLibraryFile !== "analysis/structure-library.json" || metadata.analysis.pagesFile !== "analysis/pages.json") throw new Error(`Screenshot project ${reference.screenshotProjectId} has no valid analysis index.`)
    const pagesSource = await readFile(path.join(sourceRoot, metadata.analysis.pagesFile), "utf8")
    const analyzedPages = JSON.parse(pagesSource) as Array<{route:string;[key:string]:unknown}>
    const routes = new Set(reference.screenshotIds.map(id => metadata.screenshots.find(item => item.id === id)?.route).filter((route): route is string => Boolean(route)))
    const pages = routes.size ? analyzedPages.filter(page => routes.has(page.route)) : analyzedPages
    if (!pages.length) throw new Error(`No analyzed page is selected from ${reference.screenshotProjectId}.`)
    return { projectId: reference.screenshotProjectId, pages }
  })))
  const visualReferences = mode !== "reference" ? [] : await stage("load-visual-references",async()=>{const selected=project.references.flatMap(reference=>reference.screenshotIds.map(screenshotId=>({reference,screenshotId})));if(selected.length!==1)throw new Error("Reference mode requires exactly one selected current-page screenshot.");const [{reference,screenshotId}]=selected,sourceRoot=path.join(webRoot,"docs","screenshots","projects",reference.screenshotProjectId),metadata=JSON.parse(await readFile(path.join(sourceRoot,"project.json"),"utf8")) as {screenshots:Array<{id:string;fileName:string;mimeType:string}>},screenshot=metadata.screenshots.find(item=>item.id===screenshotId);if(!screenshot)throw new Error(`Selected screenshot ${screenshotId} was not found.`);const currentFile=path.join(sourceRoot,"screenshots",screenshot.fileName),styleFile=path.join(webRoot,"docs","getgo","kids-friendly-iphone-ui","demos","login-light.png");return[{file:currentFile,mimeType:screenshot.mimeType,base64:(await readFile(currentFile)).toString("base64"),role:"current-page" as const},{file:styleFile,mimeType:"image/png",base64:(await readFile(styleFile)).toString("base64"),role:"style-reference" as const}]})
  const generator = new DesignAiGenerator({
    apiKey: process.env.GETGO_AI_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    model: process.env.GETGO_AI_OPENAI_MODEL,
    imageModel: process.env.GETGO_AI_OPENAI_IMAGE_MODEL,
  })
  const generated = await stage("openai-generate-and-validate",()=>generator.generate(project, { name, request: prompt,mode }, analyses,artDirection,visualReferences))
  const saved = await stage("persist-and-render-package",()=>designs.saveGenerated(projectId, { name, request: prompt,mode }, generated))
  const result={projectId,pageId:saved.page.id,slug:saved.page.slug,usage:generated.usage,alphaReport:generated.alphaReport,validationReport:{...generated.validationReport,status:"pass",renderedFromHtml:true},generationManifest:generated.generationManifest}
  const runFile=await report("passed",result)
  process.stdout.write(`${JSON.stringify({...result,runId,runFile},null,2)}\n`)
  } catch(error) {
    stages.push(...["load-art-direction","load-visual-references","openai-generate-and-validate","persist-and-render-package"].filter(name=>!stages.some(stage=>stage.name===name)).map(name=>({name,status:"skipped" as const,details:"Skipped because an earlier stage failed or was not required by this mode.",elapsedMs:0})))
    const runFile=await report("failed",undefined,error)
    const message=error instanceof Error?error.message:String(error)
    throw new Error(`${message}\nDetailed run report: ${runFile}`,{cause:error})
  }
}

try {
  await run()
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
  process.exitCode = 1
}

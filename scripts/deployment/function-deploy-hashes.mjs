import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function hashFile(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : ''
}

function hashDirectory(root) {
  const hash = createHash('sha256')
  const walk = directory => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else { hash.update(relative(root, full)); hash.update(readFileSync(full)) }
    }
  }
  walk(root)
  return hash.digest('hex')
}

function project(codebaseDir) {
  const configPath = join(codebaseDir, 'tsconfig.json')
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, codebaseDir, undefined, configPath)
  return ts.createProgram(parsed.fileNames, parsed.options)
}

/** Hash every exported Function with the declarations it transitively references. */
export function functionDeployHashes(codebaseDir) {
  const absoluteRoot = resolve(codebaseDir)
  const srcRoot = join(absoluteRoot, 'src')
  const program = project(absoluteRoot)
  const checker = program.getTypeChecker()
  const index = program.getSourceFile(join(srcRoot, 'index.ts'))
  if (!index) throw new Error(`Missing Functions entry point: ${join(srcRoot, 'index.ts')}`)
  const moduleSymbol = checker.getSymbolAtLocation(index)
  if (!moduleSymbol) throw new Error(`Could not inspect Functions exports in ${index.fileName}`)
  const globalInputs = [
    hashFile(join(absoluteRoot, 'package.json')),
    hashFile(join(absoluteRoot, 'package-lock.json')),
    hashFile(join(absoluteRoot, 'tsconfig.json')),
    hashDirectory(join(absoluteRoot, 'vendor')),
    hashFile(join(srcRoot, 'deploymentConfig.ts')),
    ...program.getSourceFiles()
      .filter(source => {
        const filename = resolve(source.fileName)
        return filename === srcRoot || filename.startsWith(`${srcRoot}/`)
      })
      .flatMap(source => source.statements
        .filter(statement => ts.isExpressionStatement(statement) || (ts.isImportDeclaration(statement) && !statement.importClause))
        .map(statement => `${relative(srcRoot, source.fileName)}:${statement.getText(source)}`)),
  ].join('\n')

  const inSource = declaration => {
    const filename = resolve(declaration.getSourceFile().fileName)
    return filename === srcRoot || filename.startsWith(`${srcRoot}/`)
  }
  const hashes = new Map()
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const queue = [...(symbol.declarations ?? [])]
    const seen = new Set()
    const parts = []
    while (queue.length) {
      const declaration = queue.pop()
      if (!declaration || !inSource(declaration)) continue
      const source = declaration.getSourceFile()
      const key = `${source.fileName}:${declaration.pos}:${declaration.end}`
      if (seen.has(key)) continue
      seen.add(key)
      parts.push(`${relative(srcRoot, source.fileName)}:${declaration.getText(source)}`)
      const visit = node => {
        if (ts.isIdentifier(node)) {
          let dependency = checker.getSymbolAtLocation(node)
          if (dependency?.flags & ts.SymbolFlags.Alias) dependency = checker.getAliasedSymbol(dependency)
          for (const candidate of dependency?.declarations ?? []) if (inSource(candidate)) queue.push(candidate)
        }
        ts.forEachChild(node, visit)
      }
      visit(declaration)
    }
    const digest = createHash('sha256').update(globalInputs).update(parts.sort().join('\n')).digest('hex')
    hashes.set(exported.name, digest)
  }
  return hashes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node scripts/function-deploy-hashes.mjs <functions-directory>')
  console.log(JSON.stringify(Object.fromEntries(functionDeployHashes(directory)), null, 2))
}

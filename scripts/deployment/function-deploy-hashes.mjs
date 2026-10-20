import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

function packageName(specifier) {
  if (specifier.startsWith('node:') || (!specifier.startsWith('@') && !specifier.includes('/'))) return specifier
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

function runtimeConfig(packageJson) {
  return JSON.stringify({ engines: packageJson.engines, type: packageJson.type, main: packageJson.main, exports: packageJson.exports })
}

function packageFingerprints(codebaseDir) {
  const manifest = readJson(join(codebaseDir, 'package.json'))
  const lock = readJson(join(codebaseDir, 'package-lock.json'))
  const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies }
  const cache = new Map()
  const fingerprint = (name, seen = new Set()) => {
    if (cache.has(name)) return cache.get(name)
    if (seen.has(name)) return ''
    seen.add(name)
    const declared = dependencies[name]
    const locked = lock.packages?.[`node_modules/${name}`] ?? {}
    const localArchive = typeof declared === 'string' && declared.startsWith('file:vendor/')
      ? join(codebaseDir, declared.slice('file:'.length))
      : null
    const children = Object.keys({ ...locked.dependencies, ...locked.optionalDependencies })
      .sort()
      .map(child => `${child}:${fingerprint(child, new Set(seen))}`)
    const digest = createHash('sha256')
      .update(JSON.stringify({ name, declared, version: locked.version, resolved: locked.resolved, integrity: locked.integrity }))
      .update(localArchive && existsSync(localArchive) ? readFileSync(localArchive) : '')
      .update(children.join('\n'))
      .digest('hex')
    cache.set(name, digest)
    return digest
  }
  return { manifest, fingerprint }
}

function project(codebaseDir) {
  const configPath = join(codebaseDir, 'tsconfig.json')
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, codebaseDir, undefined, configPath)
  return ts.createProgram(parsed.fileNames, parsed.options)
}

function importedModule(declaration) {
  let node = declaration
  while (node) {
    if (ts.isImportDeclaration(node)) return node.moduleSpecifier.text
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) return node.moduleReference.expression?.text
    node = node.parent
  }
  return null
}

function sourceEffects(source) {
  return source.statements.filter(statement =>
    ts.isExpressionStatement(statement) || (ts.isImportDeclaration(statement) && !statement.importClause)
  )
}

function calledModule(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0 || !ts.isStringLiteral(node.arguments[0])) return null
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return node.arguments[0].text
  return ts.isIdentifier(node.expression) && node.expression.text === 'require' ? node.arguments[0].text : null
}

/** Hash every exported Function with only its reachable source and runtime packages. */
export function functionDeployHashes(codebaseDir) {
  const absoluteRoot = resolve(codebaseDir)
  const srcRoot = join(absoluteRoot, 'src')
  const program = project(absoluteRoot)
  const checker = program.getTypeChecker()
  const index = program.getSourceFile(join(srcRoot, 'index.ts'))
  if (!index) throw new Error(`Missing Functions entry point: ${join(srcRoot, 'index.ts')}`)
  const moduleSymbol = checker.getSymbolAtLocation(index)
  if (!moduleSymbol) throw new Error(`Could not inspect Functions exports in ${index.fileName}`)
  const { manifest, fingerprint } = packageFingerprints(absoluteRoot)
  const base = runtimeConfig(manifest)
  const inSource = declaration => {
    const filename = resolve(declaration.getSourceFile().fileName)
    return filename === srcRoot || filename.startsWith(`${srcRoot}/`)
  }
  const hashes = new Map()
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const queue = [...(symbol.declarations ?? [])]
    const seen = new Set()
    const sourceFiles = new Set([index])
    const packages = new Set()
    const parts = []
    while (queue.length) {
      const declaration = queue.pop()
      if (!declaration || !inSource(declaration)) continue
      const source = declaration.getSourceFile()
      const key = `${source.fileName}:${declaration.pos}:${declaration.end}`
      if (seen.has(key)) continue
      seen.add(key)
      sourceFiles.add(source)
      parts.push(`${relative(srcRoot, source.fileName)}:${declaration.getText(source)}`)
      const visit = node => {
        const called = calledModule(node)
        if (called && !called.startsWith('.') && !called.startsWith('/')) packages.add(packageName(called))
        if (ts.isIdentifier(node)) {
          let dependency = checker.getSymbolAtLocation(node)
          const aliases = dependency?.flags & ts.SymbolFlags.Alias ? dependency.declarations ?? [] : []
          for (const alias of aliases) {
            const specifier = importedModule(alias)
            if (specifier && !specifier.startsWith('.') && !specifier.startsWith('/')) packages.add(packageName(specifier))
          }
          if (dependency?.flags & ts.SymbolFlags.Alias) dependency = checker.getAliasedSymbol(dependency)
          for (const candidate of dependency?.declarations ?? []) if (inSource(candidate)) queue.push(candidate)
        }
        ts.forEachChild(node, visit)
      }
      visit(declaration)
    }
    for (const source of sourceFiles) {
      for (const statement of sourceEffects(source)) {
        parts.push(`${relative(srcRoot, source.fileName)}:${statement.getText(source)}`)
        const visitEffect = node => {
          if (ts.isImportDeclaration(node)) {
            const specifier = node.moduleSpecifier.text
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) packages.add(packageName(specifier))
            else {
              const imported = checker.getSymbolAtLocation(node.moduleSpecifier)
              for (const declaration of imported?.declarations ?? []) {
                if (!ts.isSourceFile(declaration) || !inSource(declaration) || sourceFiles.has(declaration)) continue
                sourceFiles.add(declaration)
                parts.push(`${relative(srcRoot, declaration.fileName)}:${declaration.getText(declaration)}`)
              }
            }
          } else if (ts.isIdentifier(node)) {
            const dependency = checker.getSymbolAtLocation(node)
            for (const alias of dependency?.flags & ts.SymbolFlags.Alias ? dependency.declarations ?? [] : []) {
              const specifier = importedModule(alias)
              if (specifier && !specifier.startsWith('.') && !specifier.startsWith('/')) packages.add(packageName(specifier))
            }
          }
          const called = calledModule(node)
          if (called && !called.startsWith('.') && !called.startsWith('/')) packages.add(packageName(called))
          ts.forEachChild(node, visitEffect)
        }
        visitEffect(statement)
      }
    }
    const packageParts = [...packages].sort().map(name => `${name}:${fingerprint(name)}`)
    hashes.set(exported.name, createHash('sha256').update(base).update(parts.sort().join('\n')).update(packageParts.join('\n')).digest('hex'))
  }
  return hashes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node scripts/deployment/function-deploy-hashes.mjs <functions-directory>')
  console.log(JSON.stringify(Object.fromEntries(functionDeployHashes(directory)), null, 2))
}

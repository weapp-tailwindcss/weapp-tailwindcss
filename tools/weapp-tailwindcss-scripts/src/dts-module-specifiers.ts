import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

interface ModuleSpecifierReplacement {
  end: number
  start: number
  value: string
}

function declarationRuntimeExtension(filepath: string) {
  if (filepath.endsWith('.d.cts')) {
    return '.cjs'
  }
  if (filepath.endsWith('.d.mts')) {
    return '.mjs'
  }
  return '.js'
}

function declarationRuntimePath(filepath: string) {
  return filepath
    .replace(/\.d\.cts$/, '.cjs')
    .replace(/\.d\.mts$/, '.mjs')
    .replace(/\.d\.ts$/, '.js')
}

function hasExplicitExtension(specifier: string) {
  return /\.(?:[cm]?js|d\.[cm]?ts|json|node|css|scss|sass|less|styl)$/.test(specifier)
}

function withRuntimeExtension(specifier: string, filepath: string) {
  if (hasExplicitExtension(specifier)) {
    return specifier
  }
  if (specifier === '.' || specifier === '..' || specifier.endsWith('/..')) {
    return `${specifier}/index${declarationRuntimeExtension(filepath)}`
  }
  return `${specifier}${declarationRuntimeExtension(filepath)}`
}

function toRelativePath(filepath: string, target: string) {
  let value = relative(dirname(filepath), target).split(sep).join('/')
  if (!value.startsWith('.')) {
    value = `./${value}`
  }
  return value
}

function toModulePath(filepath: string, declarationFile: string) {
  return toRelativePath(filepath, declarationRuntimePath(declarationFile))
}

function resolveDeclarationTarget(
  target: string,
  declarationFiles: ReadonlySet<string> | undefined,
) {
  if (!declarationFiles) {
    return undefined
  }

  const candidates = [
    `${target}.d.ts`,
    `${target}.d.cts`,
    `${target}.d.mts`,
    join(target, 'index.d.ts'),
    join(target, 'index.d.cts'),
    join(target, 'index.d.mts'),
  ]
  return candidates.find(candidate => declarationFiles.has(normalize(candidate)))
}

function rewriteRelativeSpecifier(
  specifier: string,
  filepath: string,
  declarationFiles: ReadonlySet<string> | undefined,
) {
  if (filepath.endsWith('.d.cts') && declarationFiles) {
    const target = resolve(dirname(filepath), specifier)
    const cjsTarget = target.replace(/(?:\.d\.ts|\.js)$/, '.d.cts')
    if (cjsTarget !== target && declarationFiles.has(cjsTarget)) {
      return toModulePath(filepath, cjsTarget)
    }
  }
  if (hasExplicitExtension(specifier)) {
    return specifier
  }

  const target = resolve(dirname(filepath), specifier)
  const cjsTarget = filepath.endsWith('.d.cts')
    ? [`${target}.d.cts`, join(target, 'index.d.cts')].find(candidate => declarationFiles?.has(candidate))
    : undefined
  const declarationFile = cjsTarget ?? resolveDeclarationTarget(target, declarationFiles)
  if (!declarationFile) {
    return withRuntimeExtension(specifier, filepath)
  }

  return toModulePath(filepath, declarationFile)
}

function getModuleSpecifier(node: ts.Node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier : undefined
  }
  if (ts.isImportEqualsDeclaration(node)
    && ts.isExternalModuleReference(node.moduleReference)
    && node.moduleReference.expression
    && ts.isStringLiteralLike(node.moduleReference.expression)) {
    return node.moduleReference.expression
  }
  if (ts.isImportTypeNode(node)
    && ts.isLiteralTypeNode(node.argument)
    && ts.isStringLiteralLike(node.argument.literal)) {
    return node.argument.literal
  }
  return undefined
}

export function rewriteDeclarationModuleSpecifiers(
  content: string,
  filepath: string,
  distDir: string,
  declarationFiles?: ReadonlySet<string>,
) {
  const sourceFile = ts.createSourceFile(filepath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const replacements: ModuleSpecifierReplacement[] = []

  function visit(node: ts.Node) {
    const literal = getModuleSpecifier(node)
    if (literal) {
      const current = literal.text
      const next = current.startsWith('@/')
        ? rewriteRelativeSpecifier(
            toRelativePath(filepath, join(distDir, current.slice(2))),
            filepath,
            declarationFiles,
          )
        : current.startsWith('.')
          ? rewriteRelativeSpecifier(current, filepath, declarationFiles)
          : current
      if (next !== current) {
        replacements.push({
          start: literal.getStart(sourceFile) + 1,
          end: literal.getEnd() - 1,
          value: next,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((result, replacement) => {
      return `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`
    }, content)
}

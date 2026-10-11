import postcss from 'postcss'
import { parseTailwindCssDirectiveRequest } from '../../generator-plugin/directives'
import { collectCssImportRequestsRoot, isMiniProgramLocalCssImportRequest, removeUnsupportedMiniProgramCssImportsRoot } from '../../generator-plugin/local-imports'

type CssImportResolver = (request: string) => string | undefined

export function isStyleImportRequest(request: string | undefined) {
  return typeof request === 'string'
    && request.length > 0
    && !/^(?:https?:)?\/\//i.test(request)
    && /\.(?:css|wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i.test(request)
}

function removeUnsupportedMiniProgramCssImportsFallback(css: string, miniProgram: boolean) {
  if (!miniProgram || !css.includes('@import')) {
    return css
  }
  return css
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('@import')) {
        return true
      }
      const params = trimmed
        .slice('@import'.length)
        .trim()
        .replace(/;$/, '')
        .trim()
      const request = parseTailwindCssDirectiveRequest(params)
      return request === undefined || isMiniProgramLocalCssImportRequest(request)
    })
    .join('\n')
}

export function normalizeInjectableCssWithImports(css: string, miniProgram: boolean, resolveImport: CssImportResolver) {
  if (!css.includes('@import')) {
    return {
      css,
      importedStyleFiles: new Set<string>(),
    }
  }
  try {
    const root = postcss.parse(css)
    const changed = miniProgram
      ? removeUnsupportedMiniProgramCssImportsRoot(root)
      : false
    const importedStyleFiles = collectResolvedCssImports(collectCssImportRequestsRoot(root), resolveImport)
    return {
      css: changed ? root.toString() : css,
      importedStyleFiles: importedStyleFiles.size > 0
        ? importedStyleFiles
        : collectImportedCssFilesFallback(css, resolveImport),
    }
  }
  catch {
    const fallbackCss = removeUnsupportedMiniProgramCssImportsFallback(css, miniProgram)
    return {
      css: fallbackCss,
      importedStyleFiles: collectImportedCssFiles(fallbackCss, resolveImport),
    }
  }
}

function collectResolvedCssImports(requests: Iterable<string>, resolveImport: CssImportResolver) {
  const imports = new Set<string>()
  for (const request of requests) {
    const importedFile = resolveImport(request)
    if (importedFile) {
      imports.add(importedFile)
    }
  }
  return imports
}

function collectImportedCssFilesFallback(css: string, resolveImport: CssImportResolver) {
  const requests = [...css.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/g)]
    .map(match => match[1] ?? match[2] ?? match[3])
    .filter((request): request is string => typeof request === 'string' && request.length > 0)
  return collectResolvedCssImports(requests, resolveImport)
}

export function collectImportedCssFiles(css: string, resolveImport: CssImportResolver) {
  if (!css.includes('@import')) {
    return new Set<string>()
  }
  try {
    const imports = collectResolvedCssImports(collectCssImportRequestsRoot(postcss.parse(css)), resolveImport)
    return imports.size > 0 ? imports : collectImportedCssFilesFallback(css, resolveImport)
  }
  catch {
  }
  return collectImportedCssFilesFallback(css, resolveImport)
}

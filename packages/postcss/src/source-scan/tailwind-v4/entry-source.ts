import { isTailwindV4CssImportParam, isTailwindV4PreflightImportParam } from '../../compat/tailwindcss-v4/preflight-imports'
import { postcss } from '../../postcss-runtime'
import { describeCssSources } from '../description'
import { parseConfigParam } from '../params'

function collectSourceDirectives(root: postcss.Root) {
  const descriptor = describeCssSources(root, isTailwindV4CssImportParam)
  let includesPreflight = false
  root.walkAtRules((rule) => {
    if (rule.name === 'import' && isTailwindV4CssImportParam(rule.params)) {
      includesPreflight ||= isTailwindV4PreflightImportParam(rule.params)
    }
    else if (rule.name === 'tailwind') {
      includesPreflight ||= rule.params.trim() === 'base'
    }
  })
  return {
    sourceRequests: descriptor.sources,
    importSourcePath: descriptor.imports.findLast(item => item.sourcePath)?.sourcePath,
    hasSourceNone: descriptor.imports.some(item => item.none),
    hasTailwindCssImport: descriptor.imports.length > 0,
    includesPreflight,
    inlineCandidates: descriptor.inlineCandidates,
  }
}

/** 复用本次解析；命中配置缓存时不展开 inline 候选。 */
export function analyzeTailwindV4EntrySource(css: string) {
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return undefined
  }
  const configRequests = new Set<string>()
  root.walkAtRules('config', (rule) => {
    const request = parseConfigParam(rule.params)
    if (request) {
      configRequests.add(request)
    }
  })
  let directives: ReturnType<typeof collectSourceDirectives> | undefined
  return {
    configRequests: [...configRequests],
    getSourceDirectives() {
      return directives ??= collectSourceDirectives(root)
    },
  }
}

export type TailwindV4EntrySourceAnalysis = NonNullable<ReturnType<typeof analyzeTailwindV4EntrySource>>

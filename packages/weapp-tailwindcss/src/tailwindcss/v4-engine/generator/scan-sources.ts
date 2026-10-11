import type { TailwindV4GenerateOptions, TailwindV4ResolvedSource } from '../types'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describeCssSources, postcss, resolveCssScanSources } from '@weapp-tailwindcss/postcss/transform'
import { LEGACY_SOURCE_IGNORED_PATTERNS } from '@weapp-tailwindcss/source-scan'

export async function resolveScanSources(source: TailwindV4ResolvedSource, scanSources: TailwindV4GenerateOptions['scanSources']) {
  if (scanSources !== true) {
    return scanSources
  }
  const definitions: Array<{ root: postcss.Root, base: string }> = []
  const append = (css: string, base: string, from?: string) => {
    try {
      definitions.push({ root: postcss.parse(css, { from }), base })
    }
    catch {
    }
  }
  append(source.css, source.base, source.dependencies[0])
  for (const file of source.dependencies.slice(1)) {
    try {
      append(readFileSync(file, 'utf8'), path.dirname(file), file)
    }
    catch {
    }
  }
  const scan = await resolveCssScanSources(definitions, {
    base: source.base,
    defaultBase: source.projectRoot ?? source.cwd ?? source.base,
    automatic: 'fallback',
    requireImport: true,
    pattern: '**/*',
    configResolution: 'module',
    ignoredPatterns: LEGACY_SOURCE_IGNORED_PATTERNS,
  })
  return scan.entries.some(entry => !entry.negated) || scan.explicitEntries.length + scan.configEntries.length > 0
    ? scan.entries
    : false
}

export function resolveCompiledSourceRoot(source: Pick<TailwindV4ResolvedSource, 'base' | 'css'>) {
  try {
    const descriptor = describeCssSources(postcss.parse(source.css))
    for (const item of descriptor.imports) {
      if (item.none) {
        return 'none' as const
      }
      if (item.sourcePath) {
        return { base: source.base, pattern: item.sourcePath }
      }
    }
  }
  catch {
  }
  return null
}

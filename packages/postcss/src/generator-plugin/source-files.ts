import type { Result, Root } from 'postcss'
import type { TailwindSourceEntry } from '../source-scan'
import type { TailwindCandidateSource, WeappTailwindcssPostcssPluginOptions } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractValidCandidates } from '@weapp-tailwindcss/engine'
import { createSourceScanPattern, DEFAULT_SOURCE_SCAN_EXTENSIONS, expandTailwindSourceEntries } from '../source-scan'
import { resolveCssScanSources } from '../source-scan/resolve'
import { resolvePostcssBase, resolvePostcssProjectRoot } from './context'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from './directives'

const POSTCSS_SOURCE_PATTERN = createSourceScanPattern(DEFAULT_SOURCE_SCAN_EXTENSIONS)

interface ScanContext {
  css?: string | undefined
  sourceEntries?: TailwindSourceEntry[] | undefined
}

function resolveCompatibilityScan(root: Root, result: Result, options: WeappTailwindcssPostcssPluginOptions, context: ScanContext, local: boolean) {
  const css = context.css ?? root.toString()
  const applyOnly = hasTailwindApplyDirective(css) && !hasTailwindRootDirectives(root, { importFallback: true })
  const base = resolvePostcssBase(result, options)
  return resolveCssScanSources([{ root, base }], {
    base,
    automatic: local || applyOnly || options.scanSources === false ? 'disabled' : 'auto',
    pattern: POSTCSS_SOURCE_PATTERN,
    config: options.config,
    configResolution: 'path',
    sourceEntries: context.sourceEntries,
    loadConfigContent: local,
  })
}

export async function collectAutoTailwindCandidates(root: Root, result: Result, options: WeappTailwindcssPostcssPluginOptions, context: ScanContext = {}) {
  if (options.scanSources === false) {
    return new Set<string>()
  }
  const scan = await resolveCompatibilityScan(root, result, options, context, false)
  const candidates = !scan.entries.some(entry => !entry.negated)
    ? []
    : await extractValidCandidates({
        base: resolvePostcssBase(result, options),
        css: context.css ?? root.toString(),
        cwd: resolvePostcssProjectRoot(result, options),
        sources: scan.entries,
      })
  return new Set([
    ...[...candidates].filter(candidate => !scan.inlineCandidates.excluded.has(candidate)),
    ...scan.inlineCandidates.included,
  ])
}

export async function collectPostcssLocalSources(root: Root, result: Result, options: WeappTailwindcssPostcssPluginOptions, context: ScanContext = {}) {
  const scan = await resolveCompatibilityScan(root, result, options, context, true)
  // 旧适配协议中，CSS 来源与配置 content 各自应用排除规则。
  const files = [...new Set([
    ...await expandTailwindSourceEntries(scan.explicitEntries),
    ...(await Promise.all(scan.configGroups.map(entries => expandTailwindSourceEntries(entries)))).flat(),
  ])]
  const sources: TailwindCandidateSource[] = await Promise.all(files.map(async (file) => {
    const extension = path.extname(file).slice(1)
    return {
      content: await readFile(file, 'utf8'),
      ...(extension ? { extension } : {}),
    }
  }))
  return { files: [...files, ...scan.configPaths], sources }
}

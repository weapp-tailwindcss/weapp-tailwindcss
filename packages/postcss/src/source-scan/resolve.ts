import type { SourceScanPlanOptions, TailwindSourceEntry } from '@weapp-tailwindcss/source-scan'
import type { Root } from 'postcss'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createSourceScanPlan, normalizeLegacyContentEntries, resolveTailwindSourceEntry, sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { loadConfig } from 'tailwindcss-config'
import { describeCssSources } from './description'

export interface CssScanDefinition { root: Root, base: string }

export interface CssScanPolicy {
  base: string
  defaultBase?: string | undefined
  automatic: 'auto' | 'fallback' | 'disabled'
  requireImport?: boolean
  pattern: string
  config?: string | undefined
  configResolution: 'module' | 'path'
  sourceEntries?: TailwindSourceEntry[] | undefined
  loadConfigContent?: boolean
  ignoredPatterns?: readonly string[]
}

/** 将 AST 描述与配置 content 合并，再交给共享扫描策略生成执行计划。 */
export async function resolveCssScanSources(definitions: CssScanDefinition[], policy: CssScanPolicy) {
  const entries: TailwindSourceEntry[] = []
  const configEntries: TailwindSourceEntry[] = []
  const configGroups: TailwindSourceEntry[][] = []
  const configPaths = new Set<string>()
  const included = new Set<string>()
  const excluded = new Set<string>()
  let automaticBase: string | undefined
  let sourceNone = false
  let hasImport = false
  for (const { root, base } of definitions) {
    const descriptor = describeCssSources(root)
    hasImport ||= descriptor.imports.length > 0
    sourceNone ||= descriptor.imports.some(item => item.none)
    for (const item of descriptor.imports) {
      if (item.sourcePath) {
        automaticBase = sourcePathApi(base, item.sourcePath).resolve(base, item.sourcePath)
      }
    }
    for (const source of descriptor.sources) {
      entries.push(await resolveTailwindSourceEntry(source.sourcePath, base, source.negated, policy.pattern))
    }
    for (const value of descriptor.inlineCandidates.included) {
      included.add(value)
    }
    for (const value of descriptor.inlineCandidates.excluded) {
      excluded.add(value)
    }
    for (const request of descriptor.configs) {
      configPaths.add(policy.configResolution === 'module'
        ? createRequire(path.join(base, 'package.json')).resolve(request)
        : sourcePathApi(base, request).resolve(base, request))
    }
  }
  if (policy.config) {
    configPaths.add(sourcePathApi(policy.base, policy.config).resolve(policy.base, policy.config))
  }
  for (const config of policy.loadConfigContent === false ? [] : configPaths) {
    const base = path.dirname(config)
    const loaded = await loadConfig({ config, cwd: base })
    const group = normalizeLegacyContentEntries(loaded?.config.content, base, { relativeBase: base })
    configGroups.push(group)
    configEntries.push(...group)
  }
  const explicitEntries = policy.sourceEntries ?? entries
  const combinedEntries = [...explicitEntries, ...configEntries]
  let mode: SourceScanPlanOptions['mode'] = policy.automatic
  if (mode !== 'disabled') {
    if (automaticBase) {
      mode = 'auto'
    }
    else if (sourceNone || (policy.requireImport && !hasImport && combinedEntries.length === 0)) {
      mode = 'disabled'
    }
  }
  const base = automaticBase ?? (combinedEntries.length > 0 ? policy.base : policy.defaultBase ?? policy.base)
  const plan = createSourceScanPlan({
    base,
    mode,
    entries: combinedEntries,
    pattern: policy.pattern,
    ...(policy.ignoredPatterns ? { ignoredPatterns: policy.ignoredPatterns } : {}),
  })
  return {
    entries: plan,
    explicitEntries,
    configEntries,
    configGroups,
    configPaths: [...configPaths],
    inlineCandidates: { included, excluded },
  }
}

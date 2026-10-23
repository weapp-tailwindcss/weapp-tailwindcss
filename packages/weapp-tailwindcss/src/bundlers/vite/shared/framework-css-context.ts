import type { OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { ViteFrameworkCssPipelineContext } from './framework-strategy'
import type { InternalUserDefinedOptions } from '@/types'
import { snapshotConfiguration } from '@/compiler/configuration-snapshot'
import { createFrameworkAssetAccess } from './framework-assets'

interface CssContextInput {
  bundle?: OutputBundle | undefined
  currentGeneratorBranch: ViteFrameworkCssPipelineContext['currentGeneratorBranch']
  currentGeneratorOptions: ViteFrameworkCssPipelineContext['currentGeneratorOptions']
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'mainCssChunkMatcher' | 'appType' | 'escapeMap'>
  resolvedConfig: ResolvedConfig | undefined
  resolveStylePlatform: () => string | undefined
}

/** 只投影当前阶段需要的信息；框架策略不持有内部上下文或 Vite 配置。 */
export function createFrameworkCssContext(input: CssContextInput): ViteFrameworkCssPipelineContext {
  const { cssMatcher, mainCssChunkMatcher, appType, escapeMap } = input.opts
  return Object.freeze({
    get assets() { return input.bundle ? createFrameworkAssetAccess(input.bundle).read() : undefined },
    currentGeneratorBranch: Object.freeze({ ...input.currentGeneratorBranch }),
    currentGeneratorOptions: snapshotConfiguration(input.currentGeneratorOptions),
    root: input.resolvedConfig?.root,
    outDir: input.resolvedConfig?.build?.outDir,
    escapeMap: Object.freeze({ ...escapeMap }),
    matchesCss: (file: string) => cssMatcher(file),
    matchesMainCss: (file: string) => mainCssChunkMatcher(file, appType),
    resolveStylePlatform: input.resolveStylePlatform,
  })
}

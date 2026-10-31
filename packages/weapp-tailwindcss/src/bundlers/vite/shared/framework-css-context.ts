import type { OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { ViteSkylineTypographyOptions } from './framework-skyline-typography'
import type { ViteFrameworkCssPipelineContext } from './framework-strategy'
import type { InternalUserDefinedOptions } from '@/types'
import { snapshotConfiguration } from '@/compiler/configuration-snapshot'
import { createFrameworkAssetAccess } from './framework-assets'
import { resolveViteSkylineTypographyResetCss } from './framework-skyline-typography'

interface CssContextInput {
  bundle?: OutputBundle | undefined
  currentGeneratorBranch: ViteFrameworkCssPipelineContext['currentGeneratorBranch']
  currentGeneratorOptions: ViteFrameworkCssPipelineContext['currentGeneratorOptions']
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'mainCssChunkMatcher' | 'appType' | 'escapeMap'> & Partial<ViteSkylineTypographyOptions>
  resolvedConfig: ResolvedConfig | undefined
  resolveStylePlatform: () => string | undefined
}

/** 保留惰性资产访问；扩展类型仅从实参推断，避免目标类型反向要求重复提供基础字段。 */
export function extendFrameworkCssContext<Context extends ViteFrameworkCssPipelineContext, Extension extends object>(
  context: Context,
  extension: Extension,
): Omit<Context, keyof Extension> & Readonly<NoInfer<Extension>> {
  return Object.freeze(Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(context),
    ...Object.getOwnPropertyDescriptors(extension),
  })) as Omit<Context, keyof Extension> & Readonly<Extension>
}

/** 只投影当前阶段需要的信息；框架策略不持有内部上下文或 Vite 配置。 */
export function createFrameworkCssContext(input: CssContextInput): ViteFrameworkCssPipelineContext {
  const { cssMatcher, mainCssChunkMatcher, appType, escapeMap } = input.opts
  const skylineResetCss = resolveViteSkylineTypographyResetCss(input.opts, input.resolveStylePlatform(), input.currentGeneratorBranch.isWeb)
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
    getSkylineTypographyResetCss: () => skylineResetCss,
  })
}

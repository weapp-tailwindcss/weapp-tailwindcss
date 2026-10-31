import type { OutputBundle } from 'rollup'
import type { ViteFrameworkCssPipelineContext } from '../shared/framework-strategy'
import type { GenerateBundleContext } from './types'
import path from 'node:path'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { createFrameworkCssContext, extendFrameworkCssContext } from '../shared/framework-css-context'
import { resolveViteWebCssCompatOptions, shouldApplyViteWebCssCompat } from '../web-css-compat'

function inferPlatformFromViteOutDir(outDir: string | undefined) {
  const segment = outDir ? path.basename(path.normalize(outDir)) : undefined
  if (!segment) {
    return
  }
  const normalized = segment.trim().toLowerCase()
  if (normalized === 'h5' || normalized === 'web' || normalized === 'app' || normalized === 'app-plus' || normalized.startsWith('app-') || normalized.startsWith('mp-') || normalized.startsWith('quickapp-webview')) {
    return normalized
  }
}

/** 按调用阶段解析配置；初始模块阶段不读取尚未建立的产物图。 */
export function createGenerateBundleCssContext(context: GenerateBundleContext, bundle?: OutputBundle) {
  const resolvedConfig = context.getResolvedConfig()
  const generatorPlatform = context.opts.cssOptions?.platform ?? context.opts.platform ?? inferPlatformFromViteOutDir(resolvedConfig?.build?.outDir)
  const generatorOptions = resolveContextGeneratorConfiguration(context.opts, {
    platform: generatorPlatform,
    tailwindcssMajorVersion: context.runtimeState.tailwindRuntime.majorVersion,
  }).options
  const generatorBranch = generatorOptions.branch
  const cssPipelineContext = createFrameworkCssContext({
    bundle,
    currentGeneratorBranch: generatorBranch,
    currentGeneratorOptions: generatorOptions,
    opts: context.opts,
    resolvedConfig,
    resolveStylePlatform: () => generatorPlatform,
  })
  return { cssPipelineContext, generatorBranch, generatorPlatform, resolvedConfig }
}

/** 在本轮上下文固定后装配框架输出策略，转换时再调用实际生成钩子。 */
export function resolveGenerateBundleCssPolicies(context: GenerateBundleContext, cssPipelineContext: ViteFrameworkCssPipelineContext) {
  const strategy = context.cssPipelineStrategy
  const shouldApplyWebCssCompat = shouldApplyViteWebCssCompat(cssPipelineContext, strategy)
  const transformWebTargetCss = (css: string) => context.cssPipelineStrategy?.generation?.transformGeneratedCss?.(css, extendFrameworkCssContext(cssPipelineContext, {
    defaultWebCssCompat: (value: string) => transformWebCssCompat(value, resolveViteWebCssCompatOptions(cssPipelineContext), { deferPropertyFallback: true }),
    removeScopedPreflight: (value: string) => value,
    shouldApplyWebCssCompat,
  })) ?? (shouldApplyWebCssCompat ? transformWebCssCompat(css, resolveViteWebCssCompatOptions(cssPipelineContext), { deferPropertyFallback: true }) : css)
  const isNativeAppStyleTarget = strategy?.generation?.isNativeAppStyleTarget?.(cssPipelineContext) === true
  const isHarmonyAppStyleTarget = strategy?.generation?.isHarmonyAppStyleTarget?.(cssPipelineContext) === true
  const shouldPreserveAppCssExtension = strategy?.styles?.shouldPreserveStyleOutputExtension?.(cssPipelineContext) ?? (isNativeAppStyleTarget || isHarmonyAppStyleTarget)
  return { isHarmonyAppStyleTarget, isNativeAppStyleTarget, shouldPreserveAppCssExtension, transformWebTargetCss }
}

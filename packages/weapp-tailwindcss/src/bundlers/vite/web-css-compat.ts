import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from './shared/framework-strategy'

/**
 * Web target 的 Tailwind 兼容转换由 generator-css 负责；Vite 外层只处理非 Web 生成目标
 * 落到 WebView 产物时的最终兼容需求，避免同一份 CSS 在 dev/build 中被重复解析转换。
 */
export function shouldApplyViteWebCssCompat(
  context: ViteFrameworkCssPipelineContext,
  strategy: ViteFrameworkCssPipelineStrategy | undefined,
) {
  if (strategy?.generation?.shouldApplyWebCssCompat?.(context) !== true) {
    return false
  }
  return !context.currentGeneratorBranch.isWeb
    || context.currentGeneratorOptions.webCompat !== undefined
}

export function resolveViteWebCssCompatOptions(
  context: ViteFrameworkCssPipelineContext,
) {
  return context.currentGeneratorBranch.isWeb
    ? context.currentGeneratorOptions.webCompat
    : context.currentGeneratorOptions.webCompat ?? true
}

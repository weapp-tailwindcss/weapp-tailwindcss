import type { OutputAsset, OutputBundle } from 'rollup'
import type { CssFinalizerContext } from './options'
import path from 'node:path'
import { analyzeCssCalcContext, applyConfiguredCssCalc, applyConfiguredCssUnits, fingerprintStyleOptions } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { collectCssCalcScopes } from './css-scope-graph'

interface FinalizedCss {
  asset: OutputAsset
  original: string
  final: string
  autoSignature?: string | undefined
}

const previousAssets = new WeakMap<CssFinalizerContext, Map<string, FinalizedCss>>()

function readSource(asset: OutputAsset) {
  return typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
}

/** 按最终消费作用域求值；保留原始表达式供后续 watch 构建重新判断。 */
export async function finalizeCssCalc(bundle: OutputBundle, context: CssFinalizerContext, convertUnits = false) {
  const deferredOptions = context.getFinalCssCalcOptions?.()
  const resolvedOptions = deferredOptions ?? resolveStyleOptionsFromContext(context.opts)
  const options = deferredOptions ?? {
    ...context.opts,
    ...resolvedOptions,
    uniAppX: resolvedOptions.uniAppX,
  }
  const cssCalc = options.cssOptions?.cssCalc ?? options.cssCalc
  const previous = previousAssets.get(context) ?? new Map<string, FinalizedCss>()
  const assets = new Map(Object.entries(bundle).flatMap(([key, output]) => {
    const file = normalizeOutputPathKey(output.fileName || key)
    return output.type === 'asset' && context.opts.cssMatcher(file) && !context.opts.htmlMatcher(file)
      ? [[file, output] as const]
      : []
  }))
  // Rollup/watch 可能重用上一轮资产对象；求值前恢复我们持有的原始表达式。
  for (const [file, asset] of assets) {
    const prior = previous.get(file)
    if (prior?.asset === asset && readSource(asset) === prior.final) {
      asset.source = prior.original
      if (!cssCalc && convertUnits) {
        asset.source = await applyConfiguredCssUnits(prior.original, options)
      }
    }
  }
  if (!cssCalc) {
    previousAssets.delete(context)
    return
  }
  const conditionalSources = new Set<string>()
  const unresolvedSources = new Set<string>()
  const scopes = collectCssCalcScopes(bundle, {
    matchesCss: file => assets.has(normalizeOutputPathKey(file)),
    onConditionalSource: file => conditionalSources.add(file),
    onUnresolvedSource: file => unresolvedSources.add(file),
  })
  const sources = new Map([...assets].map(([file, asset]) => [file, readSource(asset)]))
  const next = new Map<string, FinalizedCss>()
  // 小程序页面/组件样式可由宿主共同加载，不一定存在 CSS import 边。
  // 自动模式保守纳入全部资产，不能把产物图中分离的文件当作已证明隔离。
  const autoScope = cssCalc === 'auto' ? [...sources.keys()] : undefined
  const readContext = (scope: string[]) => scope.map((sourceFile) => {
    const source = sources.get(sourceFile) ?? ''
    // 包装仅供变量安全分析使用，条件导入不能变成无条件主题值。
    return conditionalSources.has(sourceFile) ? `@media all{${source}}` : source
  }).join('\n')
  const autoContext = autoScope ? readContext(autoScope) : undefined
  // 完整上下文每轮只分析一次，避免按页面数量重复解析整份应用 CSS。
  const autoValues = autoContext !== undefined && unresolvedSources.size === 0
    ? analyzeCssCalcContext(autoContext).customPropertyValues
    : undefined
  const outDir = context.getResolvedConfig?.()?.build?.outDir
  const root = context.getResolvedConfig?.()?.root
  const autoSignature = autoScope
    ? JSON.stringify([
        fingerprintStyleOptions(options),
        convertUnits,
        root,
        outDir,
        unresolvedSources.size === 0,
        [...autoValues ?? []].filter(([, value]) => /rpx/i.test(value)),
      ])
    : undefined
  for (const [file, asset] of assets) {
    const original = sources.get(file)!
    const prior = previous.get(file)
    if (autoSignature !== undefined && prior?.original === original && prior.autoSignature === autoSignature) {
      asset.source = prior.final
      next.set(file, { ...prior, asset })
      if (original !== prior.final) {
        context.opts.onUpdate(asset.fileName || file, original, prior.final)
      }
      continue
    }
    const scope = autoScope ?? [...(scopes.get(file) ?? [file])]
    const contextCss = autoContext ?? readContext(scope)
    const calculated = await applyConfiguredCssCalc(original, {
      ...options,
      contextCss,
      cssCalcContextValues: autoValues,
      cssCalcContextComplete: autoScope
        ? unresolvedSources.size === 0
        : scope.every(sourceFile => !unresolvedSources.has(sourceFile)),
    })
    const css = convertUnits && deferredOptions
      ? await applyConfiguredCssUnits(calculated, {
          ...options,
          postcssOptions: { options: { from: path.resolve(root ?? '.', outDir ?? '.', file) } },
        })
      : calculated
    next.set(file, { asset, original, final: css, autoSignature })
    if (css !== original) {
      asset.source = css
      // 不把作用域求值后的结果写回生成缓存，下一轮作者 CSS 可能改变安全性。
      context.opts.onUpdate(asset.fileName || file, original, css)
    }
  }
  previousAssets.set(context, next)
}

export function finalizeWebCssCalc(bundle: OutputBundle, context: CssFinalizerContext) {
  return finalizeCssCalc(bundle, context, true)
}

import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { GeneratorResult } from '../generation-helpers/results'
import { hasCssCalcVariables } from '@/tailwindcss/v4-engine/generator/style-context'
import { transformTailwindV4CssByTarget } from '@/tailwindcss/v4-engine/miniprogram'
import { mergeGeneratorResults } from '../generation-helpers/results'

/** 先确定同一输出的完整级联，再从原始声明生成兼容 CSS。 */
export async function mergeGeneratorResultsForOutput(results: GeneratorResult[], options: Partial<IStyleHandlerOptions>) {
  const merged = mergeGeneratorResults(results)
  if (!merged || results.length < 2 || merged.target === 'tailwind' || !hasCssCalcVariables(options)) {
    return merged
  }
  const css = await transformTailwindV4CssByTarget(merged.rawCss, merged.target, {
    ...options,
    customPropertyContextCss: [options.customPropertyContextCss, merged.customPropertyContextCss].filter(Boolean).join('\n'),
  })
  return {
    ...merged,
    css,
    // 多来源级联变化可能影响旧规则，不能沿用先前已经折叠的 CSS。
    incrementalCss: undefined,
    incrementalRawCss: undefined,
  }
}

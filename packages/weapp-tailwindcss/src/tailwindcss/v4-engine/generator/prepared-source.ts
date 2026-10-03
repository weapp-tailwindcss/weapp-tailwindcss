import type { TailwindV4GenerateTarget, TailwindV4ResolvedSource } from '../types'
import { resolveCssMacroTailwindV4Source } from '../css-macro-source'
import { createCompatibleSource } from './css-compat'

/** 同一请求的增量缓存与原生生成共享准备结果，不跨请求缓存可变来源。 */
export function prepareTailwindV4Source(source: TailwindV4ResolvedSource, target: TailwindV4GenerateTarget) {
  const cssMacroSource = resolveCssMacroTailwindV4Source(source)
  return {
    cssMacroSource,
    compatibleSource: createCompatibleSource(cssMacroSource, target),
  }
}

export type PreparedTailwindV4Source = ReturnType<typeof prepareTailwindV4Source>

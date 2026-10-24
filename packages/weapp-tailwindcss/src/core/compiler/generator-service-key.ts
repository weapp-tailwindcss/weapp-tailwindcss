import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions, WeappTailwindcssGenerateResult } from '@/generator/runtime'
import { createCompilerValueFingerprint } from './source-fingerprint'

/** 候选属于请求，其余来源、准备和转换配置完整参与服务身份。 */
export function createGeneratorServiceKey(source: TailwindResolvedSource, options: WeappTailwindcssGenerateOptions = {}) {
  const { candidates: _candidates, ...configuration } = options
  return createCompilerValueFingerprint({ source, configuration })
}

/** 生成服务仅共享内部状态，交付的集合与来源元数据必须归请求所有。 */
export function copyGeneratorServiceResult(result: WeappTailwindcssGenerateResult, incremental: boolean, fallbackSources: TailwindResolvedSource['sources'] = []): WeappTailwindcssGenerateResult {
  return {
    ...result,
    classSet: new Set(result.classSet),
    rawCandidates: new Set(result.rawCandidates),
    dependencies: [...result.dependencies],
    sources: (result.sources ?? fallbackSources ?? []).map(source => ({ ...source })),
    root: result.root && typeof result.root === 'object' ? { ...result.root } : result.root,
    ...(result.customPropertyValues ? { customPropertyValues: new Map(result.customPropertyValues) } : {}),
    ...(!incremental ? { incrementalCss: undefined, incrementalRawCss: undefined } : {}),
  }
}

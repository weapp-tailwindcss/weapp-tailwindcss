import type { ResolvedGenerationStyleOptions } from '@/compiler/style-capabilities'
import type { FrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import type { TailwindV4GenerateOptions, TailwindV4GenerateTarget, TailwindV4ResolvedSource } from '@/tailwindcss/v4-engine/types'
import { shouldUseUniAppWebRpxCompatibility } from '@/framework-policies/environment'
import { captureFrameworkEnvironment, getFrameworkEnvironmentSnapshot, shouldUseContextWebRpxCompatibility } from '@/framework-policies/environment-snapshot'
import { createTailwindV4Engine as createResolvedEngine } from '@/tailwindcss/v4-engine/generator/engine'
import { transformTailwindV4CssByTarget as transformResolvedCss } from '@/tailwindcss/v4-engine/miniprogram'

/** 独立生成器与公开 Core 共享兼容解析，生成内核只消费显式能力。 */
export function resolvePublicGenerationStyleOptions(
  styleOptions: ResolvedGenerationStyleOptions | undefined,
  environment: FrameworkEnvironment,
): ResolvedGenerationStyleOptions {
  return {
    ...styleOptions,
    webRpxCompatibility: styleOptions?.webRpxCompatibility
      ?? shouldUseUniAppWebRpxCompatibility(styleOptions?.appType, ((styleOptions && getFrameworkEnvironmentSnapshot(styleOptions)) || environment).webTarget),
  }
}

/** 独立生成器入口在实例建立时固定环境，内部请求只接收显式样式能力。 */
export function createTailwindV4Engine(source: TailwindV4ResolvedSource) {
  const environment = captureFrameworkEnvironment()
  const engine = createResolvedEngine(source)
  return {
    ...engine,
    generate(options: TailwindV4GenerateOptions = {}) {
      const styleOptions = options.styleOptions as ResolvedGenerationStyleOptions | undefined
      return engine.generate({
        ...options,
        styleOptions: resolvePublicGenerationStyleOptions(styleOptions, environment),
      })
    },
  }
}

export function transformTailwindV4CssByTarget(css: string, target: TailwindV4GenerateTarget, options?: ResolvedGenerationStyleOptions) {
  return transformResolvedCss(css, target, {
    ...options,
    webRpxCompatibility: shouldUseContextWebRpxCompatibility(options),
  } as ResolvedGenerationStyleOptions)
}

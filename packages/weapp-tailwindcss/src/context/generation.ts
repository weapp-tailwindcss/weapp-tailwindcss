import type { TailwindV4GenerationCoreInput as ResolvedCoreInput } from '@/generation/service'
import type { GenerateCssByGeneratorOptions as ResolvedGenerationInput } from '@/generation/types'
import type { ValidateCandidatesByGeneratorOptions as ResolvedValidationInput } from '@/generation/validate'
import type { InternalUserDefinedOptions, TailwindcssRuntimeLike } from '@/types'
import { generateCssByGenerator as generateResolvedCss } from '@/generation/pipeline'
import { generateTailwindV4Css as generateResolvedTailwindCss } from '@/generation/service'
import { validateCandidatesByGenerator as validateResolvedCandidates } from '@/generation/validate'
import { resolveCompilationProfile } from './compilation-profile'
import { createCompilerTransformServices } from './compiler'
import { snapshotConfiguration } from './configuration-snapshot'

type LegacyInput<T> = Omit<T, 'profile' | 'compilerTransforms' | 'isConfigurationCurrent' | 'sourceRuntimeState'> & { opts: InternalUserDefinedOptions }
export type GenerateCssByGeneratorOptions = LegacyInput<ResolvedGenerationInput>
export type TailwindV4GenerationCoreInput = LegacyInput<ResolvedCoreInput>
export type ValidateCandidatesByGeneratorOptions = LegacyInput<ResolvedValidationInput>

function snapshotRuntime(runtime: TailwindcssRuntimeLike, snapshots: WeakMap<object, unknown>): TailwindcssRuntimeLike {
  const options = snapshotConfiguration(runtime.options, snapshots)
  return new Proxy(runtime, {
    get(target, key) {
      if (key === 'options') {
        return options
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function resolveInput<T extends LegacyInput<ResolvedGenerationInput> | LegacyInput<ResolvedValidationInput>>(input: T) {
  const { opts, ...request } = input
  // 同次请求共享复制记录以保留来源别名，跨请求仍创建独立快照。
  const snapshots = new WeakMap<object, unknown>()
  const { profile, isCurrent } = resolveCompilationProfile(opts, input.runtimeState, {
    platform: input.generatorPlatform,
    nativeStyle: input.cssHandlerOptions.uniAppX === true,
    styleTarget: input.cssHandlerOptions.uniAppXCssTarget,
  })
  return {
    ...request,
    ...('runtime' in input
      ? { runtime: new Set(input.runtime) }
      : {
          candidates: new Set(input.candidates),
          generatedCssSources: input.generatedCssSources ? [...input.generatedCssSources] : undefined,
        }),
    cssSources: snapshotConfiguration(input.cssSources, snapshots),
    sourceCandidates: input.sourceCandidates ? new Set(input.sourceCandidates) : undefined,
    previousClassSet: input.previousClassSet ? new Set(input.previousClassSet) : undefined,
    compilation: snapshotConfiguration(input.compilation, snapshots),
    ...('scope' in input ? { scope: snapshotConfiguration(input.scope, snapshots) } : {}),
    ...('compilationChanges' in input ? { compilationChanges: snapshotConfiguration(input.compilationChanges, snapshots) } : {}),
    cssHandlerOptions: snapshotConfiguration(input.cssHandlerOptions, snapshots),
    cssUserHandlerOptions: snapshotConfiguration(input.cssUserHandlerOptions, snapshots),
    profile,
    compilerTransforms: createCompilerTransformServices(opts),
    isConfigurationCurrent: isCurrent,
    frameworkPostcssOwner: 'frameworkPostcssOwner' in input ? input.frameworkPostcssOwner : opts,
    sourceRuntimeState: {
      tailwindRuntime: snapshotRuntime(input.runtimeState.tailwindRuntime, snapshots),
    },
  }
}

/** 旧构建入口在此完成配置解析；生成核心只接收中立配置与服务。 */
export function generateCssByGenerator(input: GenerateCssByGeneratorOptions) {
  return generateResolvedCss(resolveInput(input))
}

export function generateTailwindV4Css(input: TailwindV4GenerationCoreInput) {
  return generateResolvedTailwindCss(resolveInput(input))
}

export function validateCandidatesByGenerator(input: ValidateCandidatesByGeneratorOptions) {
  return validateResolvedCandidates(resolveInput(input))
}

import type { FrameworkEnvironment } from './environment-snapshot'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { resolveUniUtsPlatform } from '@weapp-tailwindcss/env'
import { captureFrameworkEnvironment } from './environment-snapshot'
import { createGenericFrameworkPolicy } from './generic'
import { applyMpxPolicy } from './mpx'
import { applyUniAppPolicy } from './uni-app'
import { applyUniAppXPolicy } from './uni-app-x'

/** 每次解析创建独立策略快照，避免环境与多构建实例之间共享可变配置。 */
export function resolveFrameworkPolicy(input: FrameworkPolicyInput = {}, environment: FrameworkEnvironment = captureFrameworkEnvironment()): FrameworkPolicy {
  const platform = typeof input.uniUtsPlatform === 'object' && input.uniUtsPlatform !== null
    ? input.uniUtsPlatform
    : input.uniUtsPlatform === undefined ? environment.uniUtsPlatform : resolveUniUtsPlatform(input.uniUtsPlatform)
  const policy = applyUniAppXPolicy(applyUniAppPolicy(createGenericFrameworkPolicy(input, environment), input, environment), input, platform)
  return applyMpxPolicy(policy, input, environment)
}

export { generatorTargetEnvKeys, inferGeneratorTargetFromEnv, shouldUseUniAppViteWebViewGeneratorTarget, shouldUseUniAppWebRpxCompatibility, shouldUseWebGeneratorTargetFromEnv } from './environment'
export { isNativeStyleEnabled as isRuntimeUniAppXEnabled } from './uni-app-x'

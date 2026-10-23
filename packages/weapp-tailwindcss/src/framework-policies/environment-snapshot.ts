import type { UniPlatformInfo as UniUtsPlatformInfo } from '@weapp-tailwindcss/env'
import process from 'node:process'
import { resolveMpxPlatform, resolveUniUtsPlatform } from '@weapp-tailwindcss/env'
import { generatorTargetEnvKeys, inferGeneratorTargetFromEnv, shouldUseUniAppWebRpxCompatibility, shouldUseWebGeneratorTargetFromEnv } from './environment'

export interface FrameworkEnvironment {
  readonly values: Readonly<Partial<Record<(typeof generatorTargetEnvKeys)[number], string | undefined>>>
  readonly defaultGeneratorTarget: 'weapp' | 'web'
  readonly webTarget: boolean
  readonly uniPlatform: string | undefined
  readonly uniUtsPlatform: Readonly<UniUtsPlatformInfo>
  readonly mpxPlatform: string | undefined
}

const frameworkEnvironment = Symbol('weapp-tailwindcss.framework-environment')

interface EnvironmentOwner {
  [frameworkEnvironment]?: FrameworkEnvironment
  tailwindRuntime?: EnvironmentOwner | undefined
}

/** 每个编译上下文独立捕获环境事实，配置和阶段参数仍由调用时解析。 */
export function captureFrameworkEnvironment(): FrameworkEnvironment {
  return Object.freeze({
    values: Object.freeze(Object.fromEntries(generatorTargetEnvKeys.map(key => [key, process.env[key]]))),
    defaultGeneratorTarget: inferGeneratorTargetFromEnv(),
    webTarget: shouldUseWebGeneratorTargetFromEnv(),
    uniPlatform: process.env['UNI_PLATFORM'],
    uniUtsPlatform: Object.freeze(resolveUniUtsPlatform()),
    mpxPlatform: resolveMpxPlatform().normalized,
  })
}

/** 快照不参与公开选项枚举；上下文代理直接读取，浅复制通过运行时所有者继承。 */
export function initializeFrameworkEnvironment(owner: object, source?: object) {
  Object.defineProperty(owner, frameworkEnvironment, {
    value: source ? resolveFrameworkEnvironment(source) : captureFrameworkEnvironment(),
    configurable: true,
  })
}

export function resolveFrameworkEnvironment(owner?: object): FrameworkEnvironment {
  const context = owner as EnvironmentOwner | undefined
  return context?.[frameworkEnvironment] ?? context?.tailwindRuntime?.[frameworkEnvironment] ?? captureFrameworkEnvironment()
}

/** 将实例环境传给后续样式转换，同时保留独立 API 的即时环境语义。 */
export function withFrameworkEnvironment<T extends object>(value: T, owner: object): T {
  return Object.assign(value, { [frameworkEnvironment]: resolveFrameworkEnvironment(owner) })
}

export function shouldUseContextWebRpxCompatibility(options?: { appType?: string | undefined }): boolean {
  return shouldUseUniAppWebRpxCompatibility(options?.appType, resolveFrameworkEnvironment(options).webTarget)
}

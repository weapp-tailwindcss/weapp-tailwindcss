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
  readonly compilerMode: 'legacy' | 'graph' | 'shadow'
  readonly sourceConcurrency: number
  readonly shadowGate: string | undefined
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
    compilerMode: process.env['WEAPP_TAILWINDCSS_COMPILER'] === 'legacy' || process.env['WEAPP_TAILWINDCSS_COMPILER'] === 'shadow'
      ? process.env['WEAPP_TAILWINDCSS_COMPILER']
      : 'graph',
    shadowGate: process.env['WEAPP_TAILWINDCSS_COMPILER_SHADOW_GATE'],
    sourceConcurrency: Math.max(1, Number.parseInt(process.env['WEAPP_TW_GENERATOR_SOURCE_CONCURRENCY'] ?? '', 10) || 1),
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

/** 内部实例必须显式继承环境，禁止丢失所有权后重新读取全局环境。 */
export function getFrameworkEnvironmentSnapshot(owner: object): FrameworkEnvironment | undefined {
  const context = owner as EnvironmentOwner
  return context[frameworkEnvironment] ?? context.tailwindRuntime?.[frameworkEnvironment]
}

export function requireFrameworkEnvironment(owner: object): FrameworkEnvironment {
  const environment = getFrameworkEnvironmentSnapshot(owner)
  if (!environment) {
    throw new Error('编译实例缺少环境快照。')
  }
  return environment
}

/** 将实例环境传给后续样式转换，同时保留独立 API 的即时环境语义。 */
export function withFrameworkEnvironment<T extends object>(value: T, owner: object): T {
  return Object.assign(value, { [frameworkEnvironment]: resolveFrameworkEnvironment(owner) })
}

export function shouldUseContextWebRpxCompatibility(options?: { appType?: string | undefined, webRpxCompatibility?: boolean | undefined }): boolean {
  return options?.webRpxCompatibility ?? shouldUseUniAppWebRpxCompatibility(options?.appType, resolveFrameworkEnvironment(options).webTarget)
}

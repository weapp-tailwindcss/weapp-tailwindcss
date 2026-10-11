import type { ViteFrameworkName } from '../framework-selector'
import type { UserDefinedOptions } from '@/types'

/** Vite 插件链按运行场景拆分的能力开关。 */
export interface ViteCapabilityProfile {
  name: 'framework' | 'generic-web'
  /** 是否只装配 CSS 生成链路，不注册 JS/template 和小程序产物处理。 */
  cssOnly?: boolean
  frameworkName: ViteFrameworkName
  generatorTarget: 'web' | 'weapp' | 'app' | undefined
  platformFamily: 'web' | 'native-app' | 'mini-program' | 'unknown'
  command?: 'serve' | 'build' | undefined
  watch?: boolean
  ssr?: boolean
  environmentName?: string
  sourceCandidates: boolean
  frameworkExtras: boolean
  serveJsTransform: boolean
  styleInjector: boolean
}

export const frameworkViteCapabilityProfile: ViteCapabilityProfile = {
  name: 'framework',
  frameworkName: 'generic',
  generatorTarget: undefined,
  platformFamily: 'unknown',
  sourceCandidates: true,
  frameworkExtras: true,
  serveJsTransform: true,
  styleInjector: true,
}

export function createGenericWebViteCapabilityProfile(options: UserDefinedOptions): ViteCapabilityProfile {
  return {
    name: 'generic-web',
    cssOnly: true,
    frameworkName: 'generic',
    generatorTarget: 'web',
    platformFamily: 'web',
    // tracing 需要源码候选图；显式打开时恢复该能力。
    sourceCandidates: options.cssSourceTrace === true || typeof options.cssSourceTrace === 'object',
    frameworkExtras: false,
    serveJsTransform: false,
    // 高级用户显式配置 styleInjector 时仍允许注入。
    styleInjector: options.styleInjector !== undefined,
  }
}

/** 框架兼容入口解析后的能力，编译核心只消费这些中立决策。 */
export interface FrameworkPolicy {
  readonly defaultGeneratorTarget: 'weapp' | 'web'
  readonly useNativeApp: boolean
  readonly contextDefaults: Readonly<{ platform?: string | undefined }>
  readonly disableWebRemToRpx: boolean
  readonly preserveWebRuntimeProperties: boolean
  readonly unsupportedNativeCss: 'error' | 'warn' | 'silent'
  readonly preflight: {
    readonly defaults: Readonly<Record<string, string | false>> | undefined
    readonly localImports: boolean
    readonly suppress: boolean
  }
}

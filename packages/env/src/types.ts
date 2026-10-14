export type DetectableAppType = 'mpx' | 'taro' | 'uni-app' | 'uni-app-vite' | 'uni-app-x' | 'weapp-vite'

export type FrameworkEnv = Record<string, string | undefined> & Partial<Record<
  | 'MPX_CLI_MODE'
  | 'MPX_CURRENT_TARGET_MODE'
  | 'NODE_PATH'
  | 'TARO_ENV'
  | 'UNI_PLATFORM'
  | 'UNI_UTS_PLATFORM'
  | 'WEAPP_TAILWINDCSS_TARGET'
  | 'WEAPP_TW_TARGET',
  string | undefined
>>

export interface UniPlatformInfo {
  raw: string | undefined
  normalized: string | undefined
  isApp: boolean
  isAppAndroid: boolean
  isAppHarmony: boolean
  isAppIos: boolean
  isMp: boolean
  isWeb: boolean
}

export type CanonicalPlatform
  = | 'mp-weixin'
    | 'mp-alipay'
    | 'mp-baidu'
    | 'mp-jd'
    | 'mp-qq'
    | 'mp-toutiao'
    | 'mp-dingtalk'
    | 'web'
    | 'app'
    | 'app-plus'
    | 'app-android'
    | 'app-ios'
    | 'app-harmony'

export interface PlatformIdentityInfo {
  raw: string | undefined
  normalized: string | undefined
  canonical: CanonicalPlatform | undefined
}

export interface HBuilderXRuntimeHints {
  cwd?: string | undefined
  env?: FrameworkEnv | undefined
  nodePath?: string | null | undefined
}

export interface PackageJsonLike {
  'dependencies'?: Record<string, string> | undefined
  'devDependencies'?: Record<string, string> | undefined
  'peerDependencies'?: Record<string, string> | undefined
  'optionalDependencies'?: Record<string, string> | undefined
  'scripts'?: Record<string, string> | undefined
  'uni-app'?: unknown
}

export interface UniAppManifestLike {
  'uni-app-x'?: unknown
}

export interface DetectAppTypeOptions {
  /**
   * 项目根目录。传入后会读取 marker、manifest.json 与 package.json。
   */
  root?: string | undefined
  /**
   * 已解析的 package.json 内容。适合在调用方已经读取配置时复用。
   */
  packageJson?: PackageJsonLike | undefined
  /**
   * 已解析的 uni-app manifest.json 内容，用于识别 uni-app x。
   */
  manifest?: UniAppManifestLike | undefined
  /**
   * 是否从 root 向上查找 package.json 与 manifest.json。
   *
   * @default `true`
   */
  searchUp?: boolean | undefined
  /**
   * 环境变量快照。传入后可用于识别 HBuilderX、Taro、MPX 与 uni-app 运行环境。
   * 缺失字段不会回退到进程环境。
   */
  env?: FrameworkEnv | undefined
  /**
   * 是否读取当前进程环境变量参与推断。
   *
   * @default `false`
   */
  detectEnv?: boolean | undefined
  /**
   * HBuilderX 插件运行时的工作目录。默认使用 `root`，启用 `detectEnv` 时会回退到 `process.cwd()`。
   */
  cwd?: string | undefined
  /**
   * 是否在 HBuilderX 插件运行时把 uni-app 识别为 uni-app Vite。
   *
   * @default `true`
   */
  hbuilderxVite?: boolean | undefined
}

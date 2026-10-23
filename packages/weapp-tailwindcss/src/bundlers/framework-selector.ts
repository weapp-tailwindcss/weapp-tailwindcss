import type { DetectableAppType, DetectAppTypeOptions, FrameworkEnv } from '@/framework'
import type { GulpFrameworkName, ViteFrameworkName, WebpackFrameworkName } from '@/framework/catalog'
import type { AppType, UserDefinedOptions } from '@/types'
import { detectAppType } from '@/framework'
import { isSupportedFramework, normalizeFrameworkName } from '@/framework/catalog'
import { resolveUniAppXOptions } from '@/uni-app-x/options'

export interface ResolveBundlerFrameworkOptions extends Pick<DetectAppTypeOptions, 'cwd' | 'env' | 'manifest' | 'packageJson' | 'root' | 'searchUp'> {
  appType?: AppType | undefined
  detectEnv?: boolean | undefined
  uniAppX?: UserDefinedOptions['uniAppX']
}

export type { GulpFrameworkName, ViteFrameworkName, WebpackFrameworkName } from '@/framework/catalog'

export interface BundlerFrameworkProfile<Name extends string> {
  appType?: AppType | DetectableAppType | undefined
  frameworkName: Name
}

export type ViteFrameworkProfile = BundlerFrameworkProfile<ViteFrameworkName>
export type WebpackFrameworkProfile = BundlerFrameworkProfile<WebpackFrameworkName>
export type GulpFrameworkProfile = BundlerFrameworkProfile<GulpFrameworkName>

export interface BundlerFrameworkState<Profile, Options> {
  current: () => Profile
  refresh: (options?: Partial<Options>) => Profile
}

export function resolveBundlerAppType(options: ResolveBundlerFrameworkOptions): AppType | DetectableAppType | undefined {
  if (options.appType) {
    return options.appType
  }
  return detectAppType({
    cwd: options.cwd,
    detectEnv: options.detectEnv,
    env: options.env as FrameworkEnv | undefined,
    manifest: options.manifest,
    packageJson: options.packageJson,
    root: options.root,
    searchUp: options.searchUp,
  })
}

function isUniAppXFramework(appType: AppType | DetectableAppType | undefined, uniAppX: UserDefinedOptions['uniAppX']) {
  return appType === 'uni-app-x' || resolveUniAppXOptions(uniAppX).enabled
}

export function resolveViteFrameworkProfile(options: ResolveBundlerFrameworkOptions): ViteFrameworkProfile {
  const appType = resolveBundlerAppType(options)
  if (isUniAppXFramework(appType, options.uniAppX)) {
    return { appType, frameworkName: 'uni-app-x' }
  }
  const frameworkName = normalizeFrameworkName(appType)
  return { appType, frameworkName: isSupportedFramework('vite', frameworkName) ? frameworkName : 'generic' }
}

export function resolveWebpackFrameworkProfile(options: ResolveBundlerFrameworkOptions): WebpackFrameworkProfile {
  const appType = resolveBundlerAppType(options)
  if (appType === 'mpx') {
    return { appType, frameworkName: 'mpx' }
  }
  if (appType === 'taro') {
    return { appType, frameworkName: 'taro' }
  }
  if (isUniAppXFramework(appType, options.uniAppX)) {
    return { appType, frameworkName: 'uni-app' }
  }
  const frameworkName = normalizeFrameworkName(appType)
  return { appType, frameworkName: isSupportedFramework('webpack', frameworkName) ? frameworkName : 'generic' }
}

export function resolveGulpFrameworkProfile(options: ResolveBundlerFrameworkOptions): GulpFrameworkProfile {
  return {
    appType: resolveBundlerAppType(options),
    frameworkName: 'native',
  }
}

export function createViteFrameworkProfileState(options: ResolveBundlerFrameworkOptions): BundlerFrameworkState<ViteFrameworkProfile, ResolveBundlerFrameworkOptions> {
  let currentOptions = { ...options }
  let currentProfile = resolveViteFrameworkProfile(currentOptions)
  return {
    current() {
      return currentProfile
    },
    refresh(nextOptions = {}) {
      currentOptions = {
        ...currentOptions,
        ...nextOptions,
      }
      currentProfile = resolveViteFrameworkProfile(currentOptions)
      return currentProfile
    },
  }
}

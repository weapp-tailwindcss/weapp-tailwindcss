export type TailwindcssBranchVersion = 4

export type RuntimePlatformFamily = 'web' | 'mini-program' | 'native-app'

export type NativeAppPlatform = 'android' | 'ios' | 'harmony' | 'unknown'

export type WeappTailwindcssGeneratorTarget = 'weapp' | 'web'

export interface RuntimeBranch {
  tailwindcssVersion: TailwindcssBranchVersion
  generatorTarget: WeappTailwindcssGeneratorTarget
  platformFamily: RuntimePlatformFamily
  platform: string | undefined
  nativeAppPlatform?: NativeAppPlatform | undefined
  isTailwindV4: boolean
  isWeb: boolean
  isMiniProgram: boolean
  isNativeApp: boolean
}

export function shouldUseMiniProgramCssBranch(branch: RuntimeBranch) {
  return branch.platformFamily === 'mini-program' || branch.platformFamily === 'native-app'
}

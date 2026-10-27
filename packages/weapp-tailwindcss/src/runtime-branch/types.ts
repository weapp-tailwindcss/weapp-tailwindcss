import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { RuntimeBranch, TailwindcssBranchVersion, WeappTailwindcssGeneratorTarget } from '@/compiler/target'
import type { AppType } from '@/types/shared'

import type { UniUtsPlatformInfo } from '@/utils'

export type { NativeAppPlatform, RuntimeBranch, RuntimePlatformFamily, TailwindcssBranchVersion, WeappTailwindcssGeneratorTarget } from '@/compiler/target'

export interface RuntimeBranchContext {
  appType?: AppType | undefined
  generatorTarget: WeappTailwindcssGeneratorTarget
  platform?: IStyleHandlerOptions['platform'] | undefined
  tailwindcssMajorVersion?: number | undefined
  uniAppX?: boolean | { enabled?: boolean | undefined } | undefined
  uniUtsPlatform?: string | UniUtsPlatformInfo | undefined
}

export interface RuntimeBranchGeneratorOptions {
  target: WeappTailwindcssGeneratorTarget
  branch?: RuntimeBranch | undefined
}

export interface RuntimeBranchBaseContext {
  context: RuntimeBranchContext
  tailwindcssVersion: TailwindcssBranchVersion
  uniUtsPlatform: UniUtsPlatformInfo
}

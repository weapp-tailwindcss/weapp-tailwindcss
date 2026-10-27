import type { UniPlatformInfo as UniUtsPlatformInfo } from '@weapp-tailwindcss/env'

/** 仅在兼容入口读取旧配置；不向编译管线传播框架身份判断。 */
export interface FrameworkPolicyInput {
  appType?: string | undefined
  platform?: string | undefined
  uniAppX?: boolean | { enabled?: boolean | undefined, uvueUnsupported?: 'error' | 'warn' | 'silent' | undefined } | undefined
  uniUtsPlatform?: string | UniUtsPlatformInfo | undefined
  nativeStyle?: boolean | undefined
  styleTarget?: string | undefined
}

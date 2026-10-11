import type { DetectableAppType, FrameworkEnv } from './types'
import { getProcessEnv } from './environment'
import { isRunningInHBuilderX } from './hbuilderx'
import { resolveUniPlatformsFromEnv } from './platform'

export function detectAppTypeFromEnv(env: FrameworkEnv = getProcessEnv(), options: { cwd?: string | undefined, hbuilderxVite?: boolean | undefined } = {}): DetectableAppType | undefined {
  if (env.WEAPP_TW_TARGET === 'weapp-vite' || env.WEAPP_TAILWINDCSS_TARGET === 'weapp-vite') {
    return 'weapp-vite'
  }

  if (env.TARO_ENV) {
    return 'taro'
  }

  if (env.MPX_CLI_MODE || env.MPX_CURRENT_TARGET_MODE) {
    return 'mpx'
  }

  const { uniPlatform, uniUtsPlatform } = resolveUniPlatformsFromEnv(env)
  if (uniUtsPlatform.normalized) {
    return 'uni-app-x'
  }

  if (uniPlatform.normalized) {
    return 'uni-app-vite'
  }

  if (isRunningInHBuilderX({ cwd: options.cwd, env })) {
    return options.hbuilderxVite === false ? 'uni-app' : 'uni-app-vite'
  }
}

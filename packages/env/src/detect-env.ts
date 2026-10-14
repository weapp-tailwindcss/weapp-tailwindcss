import type { AppTypeDetectionCandidate, DetectableAppType, FrameworkEnv } from './types'
import process from 'node:process'
import { getProcessEnv } from './environment'
import { isRunningInHBuilderX } from './hbuilderx'
import { collectMatches, evidence } from './matching'
import { resolveUniPlatformsFromEnv } from './platform'

interface EnvironmentDetectionOptions {
  cwd?: string | undefined
  hbuilderxVite?: boolean | undefined
}

export function* matchEnvironment(env: FrameworkEnv, options: EnvironmentDetectionOptions = {}): Iterable<AppTypeDetectionCandidate> {
  const weappKeys = ['WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET'] as const
  for (const key of weappKeys) {
    const value = env[key]
    if (value === 'weapp-vite') {
      yield { appType: 'weapp-vite', evidence: [evidence('env', key, value)] }
    }
  }
  const taro = env.TARO_ENV
  if (taro) {
    yield { appType: 'taro', evidence: [evidence('env', 'TARO_ENV', taro)] }
  }
  const mpxKeys = ['MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE'] as const
  for (const key of mpxKeys) {
    const value = env[key]
    if (value) {
      yield { appType: 'mpx', evidence: [evidence('env', key, value)] }
    }
  }
  const { uniPlatform, uniUtsPlatform } = resolveUniPlatformsFromEnv(env)
  if (uniUtsPlatform.normalized) {
    yield { appType: 'uni-app-x', evidence: [evidence('env', 'UNI_UTS_PLATFORM', uniUtsPlatform.raw)] }
  }
  if (uniPlatform.normalized) {
    yield { appType: 'uni-app-vite', evidence: [evidence('env', 'UNI_PLATFORM', uniPlatform.raw)] }
  }
  if (isRunningInHBuilderX({ cwd: options.cwd, env })) {
    yield {
      appType: options.hbuilderxVite === false ? 'uni-app' : 'uni-app-vite',
      evidence: [evidence('hbuilderx', 'cwd', options.cwd ?? process.cwd())],
    }
  }
}

export function detectAppTypeFromEnv(env: FrameworkEnv = getProcessEnv(), options: EnvironmentDetectionOptions = {}): DetectableAppType | undefined {
  return collectMatches(matchEnvironment(env, options), false)[0]?.appType
}

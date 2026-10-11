import { win32 } from 'node:path'
import process from 'node:process'

export interface ObserverLaunchOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

/** Windows PowerShell 子进程重建其原生模块路径，避免继承中介进程的 PowerShell 7 模块。 */
export function resolveObserverLaunchEnvironment(command: string, options: ObserverLaunchOptions = {}) {
  const inherited = options.env ?? process.env
  const keys = Object.keys(inherited).filter(key => key.toLowerCase() === 'psmodulepath')
  const target = win32.basename(command).toLowerCase()
  const reset = (options.platform ?? process.platform) === 'win32' && (target === 'powershell' || target === 'powershell.exe')
  let env = inherited
  if (reset) {
    env = { ...inherited }
    for (const key of keys) {
      delete env[key]
    }
  }
  return {
    env,
    diagnostic: {
      modulePathPolicy: reset ? 'windows-powershell-native' : 'inherit',
      inheritedModulePath: keys.some(key => inherited[key] !== undefined),
    },
  }
}

export type ObserverLaunchDiagnostic = ReturnType<typeof resolveObserverLaunchEnvironment>['diagnostic']

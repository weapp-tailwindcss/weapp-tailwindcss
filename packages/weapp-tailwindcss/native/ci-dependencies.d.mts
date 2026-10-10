import type { ProcessEnv } from 'node:process'

interface NativeDependenciesOptions {
  root: string
  target: string
  reuse?: boolean
  env?: ProcessEnv
  install?: (args: string[]) => void
}

/** 校验同轮依赖身份，必要时执行冻结安装。 */
export function prepareNativeDependencies(options: NativeDependenciesOptions): void

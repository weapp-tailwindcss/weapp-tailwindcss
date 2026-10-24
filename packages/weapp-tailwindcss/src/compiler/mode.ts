import type { CompilerMode } from './types'

export const COMPILER_MODE_ENV = 'WEAPP_TAILWINDCSS_COMPILER'

export function resolveCompilerMode(env: NodeJS.ProcessEnv): CompilerMode {
  const value = env[COMPILER_MODE_ENV]
  return value === 'legacy' || value === 'shadow' || value === 'graph'
    ? value
    : 'graph'
}

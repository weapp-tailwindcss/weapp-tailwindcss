import type { HBuilderXCliResolutionSource, HBuilderXCliResolveOptions } from '../types'
import process from 'node:process'
import { fileExists } from '../fs'

export const macOSStableCli = '/Applications/HBuilderX.app/Contents/MacOS/cli'
export const macOSAlphaCli = '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli'

function resolveCandidateSource(candidate: string, env: NodeJS.ProcessEnv): HBuilderXCliResolutionSource {
  if (candidate === env['HBUILDERX_CLI_PATH']) {
    return 'env'
  }
  if (candidate === macOSStableCli || candidate === macOSAlphaCli) {
    return 'default-path'
  }
  return 'candidate'
}

async function firstExisting(items: string[]) {
  for (const item of items) {
    if (await fileExists(item)) {
      return item
    }
  }
  return undefined
}

export async function resolveConfiguredCli(options: HBuilderXCliResolveOptions) {
  const env = options.env ?? process.env
  if (options.candidates) {
    const candidate = await firstExisting(options.candidates)
    if (!candidate) {
      throw new Error('未找到显式指定的 HBuilderX CLI candidate。')
    }
    return { path: candidate, source: resolveCandidateSource(candidate, env) }
  }
  if (env['HBUILDERX_CLI_PATH'] && await fileExists(env['HBUILDERX_CLI_PATH'])) {
    return { path: env['HBUILDERX_CLI_PATH'], source: 'env' as const }
  }
  return undefined
}

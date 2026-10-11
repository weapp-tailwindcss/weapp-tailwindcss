import type { OutputAsset } from 'rollup'
import { logger } from '@weapp-tailwindcss/logger'

interface GeneratorDependencyContext {
  addWatchFile?: ((id: string) => void) | undefined
}

export function createReplayCssAsset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    name: undefined,
    source,
    needsCodeReference: false,
    names: [],
    originalFileName: null,
    originalFileNames: [],
  } as OutputAsset
}

function isAddWatchFileInvalidRollupPhaseError(error: unknown) {
  const candidate = error as { code?: string, pluginCode?: string, message?: string }
  return candidate?.code === 'INVALID_ROLLUP_PHASE'
    || candidate?.pluginCode === 'INVALID_ROLLUP_PHASE'
    || candidate?.message?.includes('Cannot call "addWatchFile" after the build has finished.') === true
}

export function registerGeneratorDependencies(ctx: GeneratorDependencyContext, dependencies: readonly string[] | undefined) {
  if (typeof ctx.addWatchFile !== 'function') {
    return
  }
  for (const dependency of dependencies ?? []) {
    try {
      ctx.addWatchFile(dependency)
    }
    catch (error) {
      if (isAddWatchFileInvalidRollupPhaseError(error)) {
        logger.debug('跳过生成模式依赖监听注册，当前 Rollup 阶段不允许 addWatchFile: %s', dependency)
        continue
      }
      throw error
    }
  }
}

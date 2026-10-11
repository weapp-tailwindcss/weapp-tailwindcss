import type { SourceCandidateStore } from '@/project-sources/candidates/types-and-cache'
import { validateCandidatesByGenerator } from '@/generation/index'
import { cleanUrl } from '../utils'

type ValidateCandidatesByGeneratorOptions = Parameters<typeof validateCandidatesByGenerator>[0]

interface FrameworkModuleCandidateRegistrarOptions {
  cacheCurrent: () => void
  debug: ValidateCandidatesByGeneratorOptions['debug']
  getCssHandlerOptions: (id: string) => ValidateCandidatesByGeneratorOptions['cssHandlerOptions']
  getGeneratorPlatform: () => ValidateCandidatesByGeneratorOptions['generatorPlatform']
  invalidateRecordedGeneratorCandidates: () => void
  opts: ValidateCandidatesByGeneratorOptions['opts']
  runtimeState: ValidateCandidatesByGeneratorOptions['runtimeState']
  sourceCandidateCollector: Pick<SourceCandidateStore, 'syncModuleSource'>
  styleHandler: ValidateCandidatesByGeneratorOptions['styleHandler']
}

export function createFrameworkModuleCandidateRegistrar(options: FrameworkModuleCandidateRegistrarOptions) {
  return async (id: string, source: string, extension?: string) => {
    await options.runtimeState.readyPromise
    const candidates = await options.sourceCandidateCollector.syncModuleSource(id, source, extension)
    options.invalidateRecordedGeneratorCandidates()
    options.cacheCurrent()
    const cssHandlerOptions = options.getCssHandlerOptions(id)
    return validateCandidatesByGenerator({
      candidates,
      cssHandlerOptions,
      cssUserHandlerOptions: cssHandlerOptions,
      debug: options.debug,
      file: cleanUrl(id),
      generatorPlatform: options.getGeneratorPlatform(),
      opts: options.opts,
      rawSource: '',
      runtimeState: options.runtimeState,
      styleHandler: options.styleHandler,
    })
  }
}

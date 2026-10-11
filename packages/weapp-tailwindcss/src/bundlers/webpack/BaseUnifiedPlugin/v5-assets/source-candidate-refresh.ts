import type { SetupWebpackV5ProcessAssetsHookOptions } from './helpers'
import type { createWebpackSourceCandidateScanCache } from './source-candidate-cache'
import process from 'node:process'
import { createSourceCandidateStore } from '../../../../project-sources/candidates'
import { resolveSourceScanEntries } from '../../../shared/source-scan'

export async function refreshWebpackSourceCandidates(options: {
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options']
  debug: SetupWebpackV5ProcessAssetsHookOptions['debug']
  outputDir: string
  runtimeState: SetupWebpackV5ProcessAssetsHookOptions['runtimeState']
  scanCache: ReturnType<typeof createWebpackSourceCandidateScanCache>
  watchChangedFiles: ReadonlySet<string>
  watchMode: boolean
}) {
  const root = options.compilerOptions.tailwindcssBasedir ?? process.cwd()
  let sourceScan: Awaited<ReturnType<typeof resolveSourceScanEntries>>
  try {
    sourceScan = await resolveSourceScanEntries(options.compilerOptions, options.runtimeState.tailwindRuntime, {
      root,
      outDir: options.outputDir,
    })
  }
  catch (error) {
    options.debug('webpack source candidate scan skipped: %O', error)
    return undefined
  }
  if (!sourceScan || (!sourceScan.explicit && !sourceScan.entries?.length && !sourceScan.inlineCandidates)) {
    return undefined
  }
  return options.scanCache.resolve({
    changedFiles: options.watchChangedFiles,
    collector: createSourceCandidateStore({
      bareArbitraryValues: options.compilerOptions.arbitraryValues?.bareArbitraryValues,
      customAttributesEntities: options.compilerOptions.customAttributesEntities,
      disabledDefaultTemplateHandler: options.compilerOptions.disabledDefaultTemplateHandler,
    }),
    outDir: options.outputDir,
    root,
    sourceScan,
    watchMode: options.watchMode,
  })
}

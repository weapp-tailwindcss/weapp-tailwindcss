import type { OutputAsset, OutputChunk } from 'rollup'
import type { GenerateBundleContext, GenerateBundleThis } from './generate-bundle/types'
import { beginCompilerShadowRun } from '@/compiler'
import { runWithRemovedBundleFiles } from './bundle-state'
import { createFrameworkStyleMemory } from './generate-bundle/framework-style-memory'
import { createGenerateBundleHook as createRuntimeGenerateBundleHook } from './generate-bundle/runtime'
import {
  getActiveViteSourceOutputRelationOwner,
  withViteSourceOutputRelationOwner,
} from './source-output-relations'

// cssPipelineStrategy 的阶段调度由内部 runtime 实现承担。

export { resolveMiniProgramStyleOutputExtension, resolveReplayCssOutputFile, resolveReplayCssOutputFileFromSourceRoot, resolveViteCssPipelineOutputFile, resolveViteCssPipelineOutputFileFromSourceFile } from './css-output'
export { normalizeBundleFileNameKeysForTest } from './generate-bundle/bundle-file-names'
export { resolveRememberedCssSourceForTest } from './generate-bundle/remembered-css'
export { shouldKeepRootMiniProgramStyleAsImportShell, shouldMoveRootMiniProgramStyleToImportShellOrigin } from './generate-bundle/root-style-output'
export type { GenerateBundleContext, GenerateBundleThis, RememberedCssSource } from './generate-bundle/types'

export function createGenerateBundleHook(context: GenerateBundleContext) {
  const relationOwner = getActiveViteSourceOutputRelationOwner()
  const removalConsumer = relationOwner?.createRemovalConsumer()
  const rememberCssSource = context.rememberCssSource
  const frameworkRootImportShellTargetByFile = context.frameworkRootImportShellTargetByFile ?? new Map<string, string>()
  const frameworkStyleMemory = createFrameworkStyleMemory(frameworkRootImportShellTargetByFile)
  const runtimeHandler = createRuntimeGenerateBundleHook({
    ...context,
    frameworkRootImportShellTargetByFile,
    rememberCssSource: rememberCssSource
      ? (entry, cssRuntimeSignature) => {
          relationOwner?.recordOwnedOutput(entry.sourceFile, entry.outputFile)
          rememberCssSource(entry, cssRuntimeSignature)
        }
      : undefined,
  })
  return async function generateBundle(
    this: GenerateBundleThis,
    options: unknown,
    bundle: Record<string, OutputAsset | OutputChunk>,
  ) {
    relationOwner?.recordBundle(bundle, context.getResolvedConfig()?.root)
    const removedFiles = removalConsumer?.consume(Object.keys(bundle)) ?? []
    const rememberFrameworkStyles = frameworkStyleMemory.prepare(bundle, removedFiles)
    beginCompilerShadowRun(context.runtimeState)
    const runRuntime = () => runWithRemovedBundleFiles(
      removedFiles,
      () => runtimeHandler.call(this, options, bundle),
    )
    await (relationOwner
      ? withViteSourceOutputRelationOwner(relationOwner, runRuntime)
      : runRuntime())
    rememberFrameworkStyles()
  }
}

import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from './shared/framework-strategy'
import { normalizeMiniProgramImportShell } from '../../generation/output-import-shell'
import { shouldPreserveFrameworkRootMiniProgramImportShell } from './generate-bundle/root-style-output'

export function resolveViteServeRootMiniProgramImportShell(options: {
  css: string
  cssPipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  isWebGeneratorTarget: boolean
  outputFile: string
}) {
  const {
    css,
    cssPipelineContext,
    cssPipelineStrategy,
    isWebGeneratorTarget,
    outputFile,
  } = options
  const shouldPreserve = shouldPreserveFrameworkRootMiniProgramImportShell({
    css,
    file: outputFile,
    isWebGeneratorTarget,
    matchesCss: cssPipelineContext.opts?.cssMatcher?.(outputFile) ?? true,
    shouldKeep: () => cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
      ...cssPipelineContext,
      css,
      file: outputFile,
    }),
  })
  return shouldPreserve
    ? normalizeMiniProgramImportShell(css)
    : undefined
}

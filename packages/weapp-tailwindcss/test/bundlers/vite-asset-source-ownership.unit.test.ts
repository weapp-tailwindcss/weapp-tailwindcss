import type { OutputAsset } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'
import { applyCssResultToBundle, createMatchedCssSourceOutputResolver, resolveCssAssetOutputPlan } from '@/bundlers/vite/generate-bundle/css-output-helpers'

describe.each(['originalFileNames', 'deferred-source'])('延迟来源元数据：%s', (provenance) => {
  it.each([
    ['/workspace/styles/secondary.css', '/workspace/styles/secondary.css', 'feature/leaf.wxss'],
    ['C:\\workspace\\styles\\secondary.css', 'C:/workspace/styles/secondary.css', 'feature/leaf.acss'],
    ['D:\\secondary.css', 'D:/secondary.css', 'feature/leaf.ttss'],
    ['styles/secondary.css', 'styles/secondary.css', 'feature/leaf.acss'],
  ])('保留当前来源关联的临时资产，交给后续 bundler 映射：%s', (sourceFile, originalFile, finalFile) => {
    const file = 'style-chunk-42.css'
    const source = '.new-candidate{color:red}'
    const asset = { type: 'asset', fileName: file, source: 'old', originalFileNames: [originalFile], names: ['secondary.css'] } as OutputAsset
    const bundle = { [file]: asset }
    const plan = resolveCssAssetOutputPlan({
      assetSourceFile: sourceFile,
      bundleFiles: [file, finalFile],
      configuredEntries: [{ file: sourceFile }],
      defaultStyleOutputExtension: '.acss',
      file,
      isWebGeneratorTarget: false,
      normalizeConfiguredSourceFile: normalizeOutputPathKey,
      opts: { cssMatcher: () => true } as any,
      originalFileNames: provenance === 'originalFileNames' ? [originalFile] : undefined,
      ownedSourceFiles: [originalFile],
      pipelineContext: {} as any,
      resolveOutputFileFromMatchedCssSource: () => finalFile,
      rootImportShellOutputFile: file,
      rootImportShellTarget: undefined,
      shouldPreserveAppCssExtension: false,
      shouldReuseRootImportShell: () => false,
    })
    const emit = vi.fn()
    applyCssResultToBundle({
      assetSourceFile: sourceFile,
      bundle,
      emitOrReplayCssAsset: emit,
      file,
      originalSource: asset,
      outputFile: plan.outputFile,
      pipelineContext: {} as any,
      source,
      viteProcessedCssAsset: true,
    })
    // 下游框架使用当前资产内容创建最终产物，不能读到提前搬运留下的空壳。
    const downstream = { [finalFile]: { ...bundle[file], fileName: finalFile } }
    expect(downstream[finalFile]?.source).toBe(source)
    expect(emit).not.toHaveBeenCalled()
    expect(plan.resolveMatchedOutputFile(sourceFile)).toBe(file)
  })
})

it('普通来源元数据不阻止最终资产重新解析归属', () => {
  const sourceFile = '/workspace/styles/secondary.css'
  const resolve = createMatchedCssSourceOutputResolver({
    assetSourceFile: sourceFile,
    file: 'already-emitted.acss',
    originalFileNames: [sourceFile],
    resolveOutputFileFromMatchedCssSource: () => 'owned/secondary.acss',
  })
  expect(resolve(sourceFile)).toBe('owned/secondary.acss')
})

it.each(['entry.wxss', 'entry.acss', 'entry.ttss'])('最终平台资产中的延迟来源仍保留后续输出归属：%s', (file) => {
  const sourceFile = '/workspace/styles/secondary.css'
  const resolve = createMatchedCssSourceOutputResolver({
    assetSourceFile: sourceFile,
    file,
    originalFileNames: [sourceFile],
    ownedSourceFiles: [sourceFile],
    resolveOutputFileFromMatchedCssSource: () => `generated/${file}`,
  })
  expect(resolve(sourceFile)).toBe(`generated/${file}`)
})

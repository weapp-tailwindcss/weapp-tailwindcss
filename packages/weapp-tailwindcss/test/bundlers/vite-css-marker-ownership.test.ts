import type { OutputAsset, OutputBundle } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createViteCssAssetIdentityResolver } from '@/bundlers/vite/css-asset-identity'
import { collectRememberedCssReplayGroups, findRememberedCssSources } from '@/bundlers/vite/generate-bundle/remembered-css'
import { collectViteProcessedCssAssetResults } from '@/bundlers/vite/processed-css-assets'
import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '@/bundlers/vite/source-output-relations'

describe('Vite generated style marker ownership', () => {
  it.each([
    ['/project/Entry.uvue', '/project/Entry.uvue?vue&type=style', 'shell.acss'],
    ['C:\\project\\Entry.uvue', 'C:/project/Entry.uvue?vue&type=style', 'nested/shell.ttss'],
    ['Entry.uvue', 'Entry.uvue?vue&type=style', 'shell.qss'],
  ])('replays %s through its actual framework output', (markerFile, sourceFile, outputFile) => {
    const owner = createViteSourceOutputRelationOwner()
    withViteSourceOutputRelationOwner(owner, () => {
      const generatedCss = '.theme-dark{background-color:blue}'
      const asset = {
        type: 'asset',
        fileName: outputFile,
        names: [],
        originalFileNames: [],
        source: `${createBundlerGeneratedCssMarker('vite', markerFile)}\n${generatedCss}`,
      } as OutputAsset
      const bundle = { [outputFile]: asset } as OutputBundle
      owner.recordOwnedOutput(sourceFile, 'Entry.css')
      const resolveIdentity = createViteCssAssetIdentityResolver({
        generatorPlaceholderFile: '/virtual/placeholder.css',
        isKnownProcessedSource: () => false,
      })
      collectViteProcessedCssAssetResults(bundle, {
        isViteProcessedCssAsset: (asset, file) => resolveIdentity(asset, file).kind === 'bundler-generated',
        markCssAssetProcessed: vi.fn(),
        recordCssAssetResult: vi.fn(),
        recordViteProcessedCssAssetResult: vi.fn(),
      })
      const remembered = { outputFile: 'Entry.css', sourceFile, rawSource: '@import "./theme.css";' }
      const sources = new Map([['entry-source', remembered]])
      const options = { cssMatcher: (file: string) => /\.(?:css|acss|ttss|qss)$/.test(file) }
      const groups = collectRememberedCssReplayGroups(sources, options, '/project', false, false, undefined, undefined, [outputFile])
      expect([...groups.keys()]).toEqual([outputFile])
      expect(findRememberedCssSources(sources, outputFile, outputFile, asset, '/build', undefined)).toEqual([remembered])
      expect(asset.source).toContain(generatedCss)
    })
    owner.dispose()
  })
})

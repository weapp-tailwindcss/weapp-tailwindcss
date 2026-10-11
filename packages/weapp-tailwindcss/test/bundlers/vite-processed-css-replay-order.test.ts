import type { OutputBundle } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { syncProcessedCss } from '@/bundlers/vite/generate-bundle/finalize/sync-processed-css'

describe('processed CSS replay order', () => {
  it.each(['acss', 'ttss', 'css'])('replaces stale source records before injecting %s assets', (extension) => {
    const output = `theme.${extension}`
    const bundle: OutputBundle = {
      [output]: { type: 'asset', fileName: output, names: [], originalFileNames: [], source: '.framework{display:flex}' },
    }
    const records = new Map([
      ['/project/entry.css', { css: '.removed{color:red}', outputFile: output, injectIntoMain: true }],
    ])
    syncProcessedCss({
      bundle,
      bundleFiles: [output],
      opts: { cssMatcher: (file: string) => file.endsWith(extension), mainCssChunkMatcher: () => true },
      recordTimingDetail: vi.fn(),
      debug: vi.fn(),
      onUpdate: vi.fn(),
      rootDir: '/project',
      isWebGeneratorTarget: false,
      shouldPreserveAppCssExtension: true,
      getViteProcessedCssAssetResults: () => records,
      recordViteProcessedCssAssetResult: (file: string, css: string, meta: object) => records.set(file, { css, ...meta } as any),
      pendingRememberedCssReplayUpdates: [
        { file: '/project/entry.css', css: '.current{color:blue}', outputFile: output, injectIntoMain: true },
      ],
    } as any)
    const css = String((bundle[output] as any).source)
    expect(css).toContain('.framework')
    expect(css).toContain('.current')
    expect(css).not.toContain('.removed')
  })
})

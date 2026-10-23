import { createFrameworkAssetAccess } from '@/bundlers/vite/shared/framework-assets'
import type { OutputAsset } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { handleUniAppXPostCssTasks } from '@/bundlers/vite/frameworks/uni-app-x/postprocess'

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    names: [],
    originalFileNames: [],
    source,
  }
}

function createOptions(overrides: Partial<Parameters<typeof handleUniAppXPostCssTasks>[0]> = {}) {
  return {
    assets: createFrameworkAssetAccess({}),
    debug: vi.fn(),
    enabled: false,
    generateCss: vi.fn(async () => undefined),
    getCssHandlerOptions: vi.fn(() => ({ isMainChunk: false })),
    getProcessedCssSources: vi.fn(() => []),
    isHarmonyAppStyleTarget: false,
    isNativeAppStyleTarget: false,
    onUpdate: vi.fn(),
    ...overrides,
  } as Parameters<typeof handleUniAppXPostCssTasks>[0]
}

describe('bundlers/vite uni-app-x post css tasks', () => {
  it('returns collected apply sources without native or harmony post processing', async () => {
    const bundle = {
      'pages/index.uvue': asset('pages/index.uvue', '.apply-source{@apply flex}'),
    }

    const sources = await handleUniAppXPostCssTasks(createOptions({
      assets: createFrameworkAssetAccess(bundle),
      enabled: false,
    }))

    expect(sources.join('\n')).toContain('@apply flex')
  })

  it('injects harmony css into main asset and uvue placeholders', async () => {
    const onUpdate = vi.fn()
    const debug = vi.fn()
    const mainCssAsset = asset('styles/root.css', '.base{}')
    const pageStyleAsset = asset('pages/index.uvue', '.page{color:red}')
    const pageCodeAsset = asset('pages/index.uvue.ts', 'const GenPageStyles = []')
    const bundle = {
      'assets/root-hash.css': mainCssAsset,
      'assets/page-style-hash': pageStyleAsset,
      'assets/page-code-hash': pageCodeAsset,
    }

    await handleUniAppXPostCssTasks(createOptions({
      assets: createFrameworkAssetAccess(bundle),
      debug,
      getCssHandlerOptions: vi.fn(file => ({
        isMainChunk: file === 'styles/root.css',
      })),
      getProcessedCssSources: () => ['.generated{color:blue}'],
      isHarmonyAppStyleTarget: true,
      onUpdate,
      enabled: true,
    }))

    expect(bundle['assets/root-hash.css']).toBe(mainCssAsset)
    expect(String(mainCssAsset.source)).toContain('.base{}')
    expect(String(mainCssAsset.source)).toContain('.generated{color:blue}')
    expect(bundle['assets/page-code-hash']).toBe(pageCodeAsset)
    expect(String(pageCodeAsset.source)).toContain('color')
    expect(String(pageCodeAsset.source)).toContain('generated')
    expect(onUpdate).toHaveBeenCalledWith('styles/root.css', '.base{}', expect.stringContaining('.generated{color:blue}'))
    expect(debug).toHaveBeenCalledWith('uni-app-x harmony main css inject')
    expect(debug).toHaveBeenCalledWith('uni-app-x style placeholder inject: %s', 'pages/index.uvue.ts')
  })
})

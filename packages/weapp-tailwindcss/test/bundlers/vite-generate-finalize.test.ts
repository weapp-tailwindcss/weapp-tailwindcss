import type { OutputAsset, OutputBundle } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { normalizeRootMiniProgramImportShellAssets } from '@/bundlers/vite/generate-bundle/finalize'
import { finalizeWebviewCssCompat } from '@/bundlers/vite/generate-bundle/finalize/root-import-shell'

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    names: [],
    originalFileNames: [],
    source,
  }
}

describe('vite generate bundle finalize helpers', () => {
  it('keeps official Web CSS unchanged when compatibility is explicitly disabled', () => {
    const css = [
      '@layer utilities {',
      '  .text-blue { color: oklch(62.3% .214 259.815); }',
      '}',
    ].join('\n')
    const styleAsset = asset('assets/style.css', css)
    const bundle: OutputBundle = {
      'assets/style.css': styleAsset,
    }
    const onUpdate = vi.fn()
    const record = vi.fn()

    expect(finalizeWebviewCssCompat(bundle, {
      debug: vi.fn(),
      onUpdate,
      opts: {
        cssMatcher: (file: string) => file.endsWith('.css'),
        generator: { target: 'web', webCompat: false },
      } as any,
      recordCssAssetResult: record,
    })).toBe(0)

    expect(styleAsset.source).toBe(css)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it('writes webview css compat results through the original output asset', () => {
    const styleAsset = asset('assets/style.css', [
      ':root { --spacing: 0.25rem; }',
      '@layer utilities {',
      '  .rounded-\\[20rpx\\] { border-radius: 0.625rem; }',
      '  .p-5 { padding: calc(var(--spacing) * 5); }',
      '  .bg-clip-text { background-clip: text; }',
      '}',
    ].join('\n'))
    const bundle: OutputBundle = {
      'assets/style-hash.css': styleAsset,
      'chunk.js': { type: 'chunk', fileName: 'chunk.js' } as any,
    }
    const onUpdate = vi.fn()
    const record = vi.fn()

    expect(finalizeWebviewCssCompat(bundle, {
      debug: vi.fn(),
      onUpdate,
      opts: {
        cssMatcher: (file: string) => file.endsWith('.css'),
        generator: {
          target: 'web',
          webCompat: true,
        },
      } as any,
      recordCssAssetResult: record,
    })).toBe(1)

    expect(bundle['assets/style-hash.css']).toBe(styleAsset)
    expect(String(styleAsset.source)).toContain('.rounded-_b20rpx_B')
    expect(String(styleAsset.source)).not.toContain('@layer')
    expect(String(styleAsset.source)).toContain('padding: calc(var(--spacing) * 5)')
    expect(String(styleAsset.source)).toContain('-webkit-background-clip: text')
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(record).toHaveBeenCalledWith('assets/style.css', String(styleAsset.source))
  })

  it('normalizes taro root css to import origin shell', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'app-origin.wxss': asset('app-origin.wxss', '.root{color:red}'),
      'chunk.js': { type: 'chunk', fileName: 'chunk.js' } as any,
    }
    const onUpdate = vi.fn()
    const record = vi.fn()

    expect(normalizeRootMiniProgramImportShellAssets(bundle, {
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      enabled: true,
      onUpdate,
      recordCssAssetResult: record,
      debug: vi.fn(),
    })).toBe(1)

    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('@import "./app-origin.wxss";\n')
    expect(String((bundle['app-origin.wxss'] as OutputAsset).source)).toBe('.root{color:red}')
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenCalledWith('app.wxss', '@import "./app-origin.wxss";\n')
  })

  it('skips taro root normalization when origin is not compatible', () => {
    const baseOptions = {
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      enabled: true,
      onUpdate: vi.fn(),
      recordCssAssetResult: vi.fn(),
      debug: vi.fn(),
    }

    expect(normalizeRootMiniProgramImportShellAssets({
      'app.wxss': asset('app.wxss', '@import "./app-origin.wxss";\n'),
      'app-origin.wxss': asset('app-origin.wxss', '.root{color:red}'),
    }, baseOptions)).toBe(0)
    expect(normalizeRootMiniProgramImportShellAssets({
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'app-origin.wxss': asset('app-origin.wxss', '@import "./other.wxss";\n'),
    }, baseOptions)).toBe(0)
    expect(normalizeRootMiniProgramImportShellAssets({
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'app-origin.wxss': asset('app-origin.wxss', '.other{color:blue}'),
    }, baseOptions)).toBe(0)
    expect(normalizeRootMiniProgramImportShellAssets({
      'app.css': asset('app.css', '.root{color:red}'),
      'app-origin.css': asset('app-origin.css', '.root{color:red}'),
    }, { ...baseOptions, enabled: false })).toBe(0)
  })
})

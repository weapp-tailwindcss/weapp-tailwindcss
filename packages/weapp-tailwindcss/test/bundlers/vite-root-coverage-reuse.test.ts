import type { OutputAsset, OutputBundle } from 'rollup'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeCssCoveredByRootStyleAssets } from '@/bundlers/vite/processed-css-assets'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

const cssMatcher = (file: string) => /\.(?:acss|ttss)$/.test(file)

afterEach(() => vi.restoreAllMocks())

describe('根样式覆盖索引的批次复用', () => {
  it('只有空白或被排除的资产时，不解析根样式', () => {
    const rootCss = '.root{color:red}'
    const bundle: OutputBundle = {
      'theme.acss': asset('theme.acss', rootCss),
      'components/empty.acss': asset('components/empty.acss', ' \n'),
      'isolated/card.ttss': asset('isolated/card.ttss', rootCss),
    }
    const parse = vi.spyOn(postcss, 'parse')
    expect(removeCssCoveredByRootStyleAssets(bundle, { cssMatcher, subpackageRoots: new Set(['isolated']) })).toBe(0)
    expect(parse).not.toHaveBeenCalled()
  })

  it('多个非微信样式产物只解析一次相同根样式，并保留各自声明', () => {
    const rootCss = Array.from({ length: 128 }, (_, i) => `.utility-${i}{width:${i}px}`).join('')
    const bundle: OutputBundle = { 'theme.acss': asset('theme.acss', rootCss) }
    for (let i = 0; i < 12; i++) {
      const file = `components/card-${i}.${i % 2 ? 'ttss' : 'acss'}`
      bundle[file] = asset(file, `${rootCss}.card-${i}{color:red}`)
    }
    const parse = vi.spyOn(postcss, 'parse')

    expect(removeCssCoveredByRootStyleAssets(bundle, { cssMatcher })).toBe(12)
    for (let i = 0; i < 12; i++) {
      const file = `components/card-${i}.${i % 2 ? 'ttss' : 'acss'}`
      expect((bundle[file] as OutputAsset).source).toBe(`.card-${i}{color:red}`)
    }
    expect(parse.mock.calls.filter(([source]) => source === rootCss)).toHaveLength(1)
  })

  it('回调修改根产物后，后续资产使用更新的覆盖索引', () => {
    const root = asset('theme.acss', '.shared{color:red}')
    const bundle: OutputBundle = {
      'theme.acss': root,
      'components/first.acss': asset('components/first.acss', '.shared{color:red}.first{display:flex}'),
      'components/second.ttss': asset('components/second.ttss', '.shared{color:red}.shared{color:blue}.second{display:block}'),
    }
    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher,
      onUpdate(file) {
        if (file === 'components/first.acss') {
          root.source = '.shared{color:blue}'
        }
      },
    })).toBe(2)
    expect((bundle['components/second.ttss'] as OutputAsset).source).toBe('.shared{color:red}.second{display:block}')
  })

  it('连续构建不复用旧根样式，也不移除独立分包的样式', () => {
    const root = asset('theme.ttss', '.shared{color:red}')
    const leaf = asset('components/card.ttss', '.shared{color:red}.card{display:flex}')
    const sub = asset('isolated/card.ttss', '.shared{color:red}')
    const bundle: OutputBundle = { 'theme.ttss': root, 'components/card.ttss': leaf, 'isolated/card.ttss': sub }
    const options = { cssMatcher, subpackageRoots: new Set(['isolated']) }
    expect(removeCssCoveredByRootStyleAssets(bundle, options)).toBe(1)
    root.source = '.shared{color:blue}'
    leaf.source = '.shared{color:red}.shared{color:blue}.card{display:flex}'
    expect(removeCssCoveredByRootStyleAssets(bundle, options)).toBe(1)
    expect(leaf.source).toBe('.shared{color:red}.card{display:flex}')
    expect(sub.source).toBe('.shared{color:red}')
  })
})

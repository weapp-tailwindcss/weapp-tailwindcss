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

  it.each([false, true])('混合 scoped 与普通资产按需补齐同一索引，scoped 优先：%s', (scopedFirst) => {
    const rootCss = '.shared{display:block;color:red}'
    const plain = asset('components/plain.acss', `${rootCss}.plain{color:blue}`)
    const scoped = asset('components/scoped.ttss', '.shared[data-v-abc]{color:red}.card[data-v-abc]{color:blue}')
    const another = asset('components/another.ttss', '.shared[data-v-def]{display:block}.another[data-v-def]{color:green}')
    const bundle: OutputBundle = { 'theme.acss': asset('theme.acss', rootCss) }
    for (const output of scopedFirst ? [scoped, plain, another] : [plain, scoped, another]) {
      bundle[output.fileName] = output
    }
    const parse = vi.spyOn(postcss, 'parse')
    const rootParseCounts: number[] = []

    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher,
      onUpdate() {
        rootParseCounts.push(parse.mock.calls.filter(([source]) => source === rootCss).length)
      },
    })).toBe(3)
    expect(plain.source).toBe('.plain{color:blue}')
    expect(scoped.source).toBe('.card[data-v-abc]{color:blue}')
    expect(another.source).toBe('.another[data-v-def]{color:green}')
    expect(rootParseCounts).toEqual(scopedFirst ? [1, 1, 1] : [1, 2, 2])
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

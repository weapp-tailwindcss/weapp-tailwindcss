import { expect, it } from 'vitest'
import { bundlerGeneratedCssMarkerRanges, createBundlerGeneratedCssEndMarker, createBundlerGeneratedCssMarker, parseBundlerGeneratedCssMarkerBlocks, replaceViteGeneratedCssModule, stripBundlerGeneratedCssMarkers } from '../src/utils/generated-css-marker'

it('生成输入指纹随标记解析、替换和 source map 区间一起消费，兼容无指纹旧标记', () => {
  const file = 'C:\\project with spaces\\Label.vue?vue&type=style&index=1'
  const marker = createBundlerGeneratedCssMarker('vite', file, 'abcdef012345')
  const source = `.before{}${marker}.old{}${createBundlerGeneratedCssEndMarker('vite', file)}.after{}`
  expect(parseBundlerGeneratedCssMarkerBlocks(source)[0]).toMatchObject({ bundler: 'vite', file, sourceHash: 'abcdef012345' })
  expect(stripBundlerGeneratedCssMarkers(source)).toBe('.before{}.old{}.after{}')
  expect(replaceViteGeneratedCssModule(source, '.new{}', candidate => candidate === file)).toBe('.before{}.new{}.after{}')
  let removed = source
  for (const range of bundlerGeneratedCssMarkerRanges(source).reverse()) {
    removed = removed.slice(0, range.start) + removed.slice(range.end)
  }
  expect(removed).toBe('.before{}.old{}.after{}')
  expect(parseBundlerGeneratedCssMarkerBlocks(createBundlerGeneratedCssMarker('vite', file))[0]).not.toHaveProperty('sourceHash')
})

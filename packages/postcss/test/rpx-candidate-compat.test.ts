import { describe, expect, it } from 'vitest'
import { normalizeRpxLengthCandidates, restoreRpxLengthCandidates, restoreRpxLengthCssSelectors } from '../src/compat/tailwindcss-v4/rpx-candidates'
import { removeDuplicatedViteMarkers } from '../src/compat/tailwindcss-v4/user-css/markers'
import { rewriteCssConfigRequests } from '../src/generator-plugin/config-directive'
import { createBundlerGeneratedCssEndMarker, createBundlerGeneratedCssMarker, replaceViteGeneratedCssModule } from '../src/utils/generated-css-marker'
import { stripTrailingLineWhitespace } from '../src/compat/webpack-css/generated-cleanup'

describe('迁移的候选与声明兼容', () => {
  it('只替换匹配的完整模块区间，保留前后层叠顺序', () => {
    const block = (file: string, css: string) => createBundlerGeneratedCssMarker('vite', file) + css + createBundlerGeneratedCssEndMarker('vite', file)
    const other = block('other.css', '.other{}')
    const source = '.before{}' + block('component.css', '.old{}') + other + '.after{}'
    expect(replaceViteGeneratedCssModule(source, '.new{}', file => file === 'component.css'))
      .toBe('.before{}.new{}' + other + '.after{}')
    expect(replaceViteGeneratedCssModule(source, '.new{}', () => false)).toBeUndefined()
    expect(replaceViteGeneratedCssModule(createBundlerGeneratedCssMarker('vite', 'component.css') + '.a{}', '.new{}', () => true)).toBeUndefined()
  })

  it('只移除行尾空白，保留缩进和换行', () => {
    expect(stripTrailingLineWhitespace('a  \n\tb\t\nc')).toBe('a\n\tb\nc')
  })

  it('rpx 长度提示可还原，显式类型和未命中候选保持不变', () => {
    const original = ['text-[3rpx]', 'hover:!border-[0.5rpx]', 'w-[3rpx]', 'text-[length:4rpx]']
    const result = normalizeRpxLengthCandidates(original)
    expect([...result.candidates]).toEqual(['text-[length:3rpx]', 'hover:!border-[length:0.5rpx]', 'w-[3rpx]', 'text-[length:4rpx]'])
    expect([...restoreRpxLengthCandidates(result.candidates, result.restoreCandidates)]).toEqual(original)
    expect(restoreRpxLengthCssSelectors(String.raw`.text-\[length\:3rpx\] { font-size: 3rpx; } .text-\[length\:4rpx\] {}`, result.restoreCandidates))
      .toBe(String.raw`.text-\[3rpx\] { font-size: 3rpx; } .text-\[length\:4rpx\] {}`)
    expect(restoreRpxLengthCssSelectors('.a{}', new Map())).toBe('.a{}')
  })

  it('只有基准已有 Vite 标记时才移除副本', () => {
    const css = '/*$vite$:file*/.a{}'
    expect(removeDuplicatedViteMarkers(css, '.b{}')).toBe(css)
    expect(removeDuplicatedViteMarkers(css, '/*$vite$:file*/')).toBe('.a{}')
    expect(removeDuplicatedViteMarkers(css, '/*$vite$:file*/')).toBe('.a{}')
  })

  it('config 改写复用请求回调并保持引号和未命中内容', () => {
    const css = '@config "relative"; @config \'#alias\'; $color: red;'
    expect(rewriteCssConfigRequests(css, request => request === 'relative' ? '/project/theme.js' : undefined))
      .toBe('@config "/project/theme.js"; @config \'#alias\'; $color: red;')
  })
})

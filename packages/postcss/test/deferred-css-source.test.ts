import { describe, expect, it } from 'vitest'
import { createDeferredCssSourceMarker, readDeferredCssSourceMarkers } from '../src/utils/deferred-css-source'
import { bundlerGeneratedCssMarkerRanges, stripBundlerGeneratedCssMarkers } from '../src/utils/generated-css-marker'

describe('延后生成来源标记', () => {
  it.each(['/project/styles/a.css', String.raw`C:\project\styles\a.css`, '/a */ @source "x".css', '../styles/a.css'])('往返路径并安全移除：%s', (file) => {
    const marker = createDeferredCssSourceMarker(file)
    const css = `.before{}${marker}.after{}`
    expect(readDeferredCssSourceMarkers(css)).toEqual([file])
    expect(stripBundlerGeneratedCssMarkers(css)).toBe('.before{}.after{}')
  })
  it('保留出现顺序、去重，并忽略非法编码', () => {
    const css = [createDeferredCssSourceMarker('/b.css'), createDeferredCssSourceMarker('/a.css'), createDeferredCssSourceMarker('/b.css'), '/*! weapp-tailwindcss deferred-source:%ZZ */'].join('')
    expect(readDeferredCssSourceMarkers(css)).toEqual(['/b.css', '/a.css'])
    expect(stripBundlerGeneratedCssMarkers(css)).toBe('')
  })
  it('元数据原始区间与字符串清理一致，不移动业务规则', () => {
    const source = `/* before */\r\n${createDeferredCssSourceMarker(String.raw`C:\styles\theme.css`)}/*! weapp-tailwindcss webpack-generated-css:a */\r\n.first{}\r\n/*! weapp-tailwindcss webpack-generated-css-end:a */\r\n/*$vite$:1*/\n.last{}`
    let result = source
    for (const range of bundlerGeneratedCssMarkerRanges(source).reverse()) {
      result = result.slice(0, range.start) + result.slice(range.end)
    }
    expect(result).toBe(stripBundlerGeneratedCssMarkers(source))
    expect(result).toContain('.first{}\r\n.last{}')
  })
})

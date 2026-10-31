import { describe, expect, it } from 'vitest'
import { createBundlerGeneratedCssMarker, parseBundlerGeneratedCssMarkerBlocks } from '@/bundlers/shared/generated-css-marker'
import { areCurrentCompiledCssSources, compiledCssSourceScopeId, createCompiledCssSourceHash, isCurrentCompiledCssSource } from '@/bundlers/vite/generate-bundle/compiled-css-source'

describe('已编译 CSS 的来源证明', () => {
  it.each(['/src/Label.vue', 'C:\\project\\Label.vue', 'C:/Label.vue', '/Label.vue', 'relative/Label.vue'])('保留路径及样式索引身份：%s', (file) => {
    const sourceFile = `${file}?vue&type=style&index=1&scoped=true&lang.scss`
    const rawSource = '@reference "./theme.css";.label{@apply w-1}'
    const source = { sourceFile, rawSource }
    const marker = createBundlerGeneratedCssMarker('vite', sourceFile, createCompiledCssSourceHash(rawSource, 2, sourceFile))
    const markers = parseBundlerGeneratedCssMarkerBlocks(`${marker}\n.label{width:17rpx}`)
    expect(isCurrentCompiledCssSource(source, markers, 2)).toBe(true)
    expect(isCurrentCompiledCssSource(source, markers, undefined)).toBe(false)
    expect(isCurrentCompiledCssSource(source, markers, 3)).toBe(false)
    expect(isCurrentCompiledCssSource({ ...source, rawSource: `${rawSource}.changed{color:red}` }, markers, 2)).toBe(false)
    expect(isCurrentCompiledCssSource({ ...source, sourceFile: sourceFile.replace('index=1', 'index=0') }, markers, 2)).toBe(false)
    expect(isCurrentCompiledCssSource({ ...source, sourceFile: sourceFile.replace('&scoped=true', '') }, markers, 2)).toBe(false)
    expect(isCurrentCompiledCssSource({ ...source, sourceFile: sourceFile.replace('lang.scss', 'lang.css') }, markers, 2)).toBe(false)
    expect(compiledCssSourceScopeId(sourceFile)).not.toBe(compiledCssSourceScopeId(sourceFile.replace('index=1', 'index=0')))
  })

  it.each([false, true])('当前载荷不能替同一请求的旧载荷背书：旧块在前=%s', (oldFirst) => {
    const sourceFile = '/component.vue?vue&type=style&index=0'
    const rawSource = '.label{@apply flex}'
    const current = createBundlerGeneratedCssMarker('vite', sourceFile, createCompiledCssSourceHash(rawSource, 'registration:1', sourceFile))
    const stale = createBundlerGeneratedCssMarker('vite', sourceFile, createCompiledCssSourceHash(rawSource, 'registration:0', sourceFile))
    const markers = parseBundlerGeneratedCssMarkerBlocks((oldFirst ? [stale, current] : [current, stale]).join('\n.label{display:flex}\n'))
    expect(isCurrentCompiledCssSource({ sourceFile, rawSource }, markers, 'registration:1')).toBe(false)
  })

  it.each(['/component.vue?vue&type=style&index=1', '/deleted.vue?vue&type=style&index=0'])('拒绝当前输入中已删除的生成来源：%s', (deletedFile) => {
    const source = { sourceFile: '/component.vue?vue&type=style&index=0', rawSource: '.label{@apply flex}' }
    const current = createBundlerGeneratedCssMarker('vite', source.sourceFile, createCompiledCssSourceHash(source.rawSource, 'current:1', source.sourceFile))
    const stale = createBundlerGeneratedCssMarker('vite', deletedFile, createCompiledCssSourceHash(source.rawSource, 'old:1', deletedFile))
    const markers = parseBundlerGeneratedCssMarkerBlocks(`${current}.label{display:flex}${stale}.deleted{display:block}`)
    expect(areCurrentCompiledCssSources([source], markers, () => 'current:1')).toBe(false)
    expect(areCurrentCompiledCssSources([source], markers.slice(0, 1), () => 'current:1')).toBe(true)
  })

  it('新输入生成后重放同路径旧载荷仍然拒绝复用', () => {
    const sourceFile = '/component.vue?vue&type=style&index=0'
    const oldSource = '.label{@apply block}'
    const newSource = '.label{@apply flex}'
    const oldMarkers = parseBundlerGeneratedCssMarkerBlocks(`${createBundlerGeneratedCssMarker('vite', sourceFile, createCompiledCssSourceHash(oldSource, 0, sourceFile))}.label{display:block}`)
    const newMarkers = parseBundlerGeneratedCssMarkerBlocks(`${createBundlerGeneratedCssMarker('vite', sourceFile, createCompiledCssSourceHash(newSource, 0, sourceFile))}.label{display:flex}`)
    const source = { sourceFile, rawSource: newSource }
    expect(isCurrentCompiledCssSource(source, newMarkers, 0)).toBe(true)
    expect(isCurrentCompiledCssSource(source, oldMarkers, 0)).toBe(false)
    expect(isCurrentCompiledCssSource(source, parseBundlerGeneratedCssMarkerBlocks(createBundlerGeneratedCssMarker('vite', sourceFile)), 0)).toBe(false)
  })
})

import type { StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { MEDIA_GATE_CANDIDATES, mediaGuardValid } from '../examples/react-lynx/src/compatibility/media-gate-contract'
import { encodeLynxCss } from './lynx/batch-encode'
import { validateMediaGateSources } from './lynx/media-gate-source'
import { validateMediaGuardArtifacts } from './lynx/media-guard-artifacts'
import { analyzeStaticCase, flattenEncodedRules, parseDecodedRules, parseGeneratedRules, selectorHasCandidate, staticMediaGuard } from './lynx/static-evidence'

const selectors = ['.hover\\:bg-\\[\\#ef4444\\]:hover', '.group-hover\\:block:is(:where(.group):hover *)']
const css = selectors.map(selector => `@media (hover: hover){${selector}{display:block}}`).join('\n')
const tasm = { css: { cssMap: { entry: selectors.map(selector => ({ type: 'MediaRule', prelude: { value: '(hover:hover)' }, rules: [{ type: 'StyleRule', selectorText: { value: selector }, style: [{ name: 'display', value: 'block' }] }] })) } } }
const build = () => ({ results: MEDIA_GATE_CANDIDATES.map(className => ({ candidates: [{ className, mediaGuard: staticMediaGuard(className, parseGeneratedRules(css), flattenEncodedRules(tasm.css.cssMap.entry)) }] })) }) as StaticEvidenceReport
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('必要媒体 guard 的全部规则证明', () => {
  it('已登记的官方源码身份完整且固定', async () => {
    await expect(validateMediaGateSources()).resolves.toBeUndefined()
  })
  it('CSS 与 TASM 的祖先条件保留在逐候选证明中', () => {
    for (const candidate of build().results.flatMap(item => item.candidates!)) {
      expect(mediaGuardValid(candidate.mediaGuard, candidate.className)).toBe(true)
    }
  })
  it.each(['(hover:hover), (min-width:1px)', 'not (hover:hover)', '(hover:none)', 'screen and (hover:hover)'])('不从 %s 推导固定必要条件', (condition) => {
    const generated = parseGeneratedRules(`@media ${condition}{${selectors[0]}{display:block}}`)
    expect(staticMediaGuard(MEDIA_GATE_CANDIDATES[0], generated, flattenEncodedRules(tasm.css.cssMap.entry))).toBeUndefined()
  })
  it('任何一个未受 guard 约束的替代规则都使必要性证明失效', () => {
    const generated = parseGeneratedRules(`${css}\n${selectors[0]}{display:block}`)
    expect(staticMediaGuard(MEDIA_GATE_CANDIDATES[0], generated, flattenEncodedRules(tasm.css.cssMap.entry))).toBeUndefined()
    const bundled = flattenEncodedRules([...tasm.css.cssMap.entry, tasm.css.cssMap.entry[0]!.rules[0]!])
    expect(staticMediaGuard(MEDIA_GATE_CANDIDATES[0], parseGeneratedRules(css), bundled)).toBeUndefined()
  })
  const equivalentSelectors = [String.raw`.\68 over\:bg-\[\#ef4444\]:hover`, String.raw`.\000068over\:bg-\[\#ef4444\]:hover`, String.raw`.\67 roup-hover\:block:is(:where(.group):hover *)`]
  it.each(equivalentSelectors)('CSS 的等价转义 %s 无 guard 时不能遗漏替代分支', (selector) => {
    const candidate = selector.includes('roup-hover') ? MEDIA_GATE_CANDIDATES[1] : MEDIA_GATE_CANDIDATES[0]
    expect(selectorHasCandidate(selector, candidate)).toBe(true)
    expect(staticMediaGuard(candidate, parseGeneratedRules(`${css}\n${selector}{display:block}`), flattenEncodedRules(tasm.css.cssMap.entry))).toBeUndefined()
  })
  it.each(equivalentSelectors)('TASM 的等价转义 %s 无 guard 时不能遗漏替代分支', (selector) => {
    const candidate = selector.includes('roup-hover') ? MEDIA_GATE_CANDIDATES[1] : MEDIA_GATE_CANDIDATES[0]
    const unguarded = { type: 'StyleRule', selectorText: { value: selector }, style: [{ name: 'display', value: 'block' }] }
    expect(staticMediaGuard(candidate, parseGeneratedRules(css), flattenEncodedRules([...tasm.css.cssMap.entry, unguarded]))).toBeUndefined()
  })
  it('属性值中的类名字面量不能冒充 class 节点', () => {
    expect(selectorHasCandidate(`[data-proof="${selectors[0]}"]`, MEDIA_GATE_CANDIDATES[0])).toBe(false)
  })
  it.each([`[data-proof="${selectors[0]}"]`, ...equivalentSelectors.slice(0, 2)])('runtime 拒绝未登记的非 canonical selector %s', (selector) => {
    const proof = build().results[0]!.candidates![0]!.mediaGuard!
    proof.generatedRules[0]!.selector = selector
    expect(mediaGuardValid(proof, MEDIA_GATE_CANDIDATES[0])).toBe(false)
  })
  it.each(['class', 'source', 'selector'] as const)('拒绝伪造的 %s proof', (mode) => {
    const proof = build().results[0]!.candidates![0]!.mediaGuard!
    if (mode === 'class') {
      proof.className = MEDIA_GATE_CANDIDATES[1]
    }
    if (mode === 'source') {
      proof.sourceSha256 = 'b'.repeat(64)
    }
    if (mode === 'selector') {
      proof.generatedRules[0]!.selector = '.unrelated'
    }
    expect(mediaGuardValid(proof, MEDIA_GATE_CANDIDATES[0])).toBe(false)
  })
  it.each(['none', 'css', 'bundle', 'hex-css', 'hex-bundle', 'metadata', 'disabled', 'group-retained', 'peer-retained'] as const)('从本轮实际 bundle 重新验证 %s，不能信任 serializer 输入或报告 metadata', async (mode) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx media guard '))
    directories.push(directory)
    const peer = String.raw`.peer-checked\:opacity-100:is(:where(.peer):checked~*)`
    const hoverCss = `@media (hover: hover){${selectors[0]}{background-color:#ef4444}}`
    const sourceCss = `${hoverCss}\n@media (hover: hover){${selectors[1]}{display:block}}\n${peer}{opacity:1}`
    const encoded = await encodeLynxCss(sourceCss, { applyCompatibility: false })
    const generated = parseGeneratedRules(sourceCss)
    const bundled = parseDecodedRules(encoded.css)
    const built = { results: compatibilityCases.filter(item => ['variant-state', 'variant-group-peer'].includes(item.id)).map(item => analyzeStaticCase(item, generated, bundled)) } as StaticEvidenceReport
    const alternate = mode === 'hex-css' ? equivalentSelectors[0] : selectors[0]
    await fs.writeFile(path.join(directory, 'main.css'), mode === 'css' || mode === 'hex-css' ? `${sourceCss}\n${alternate}{background-color:#ef4444}` : sourceCss)
    let actualCss = sourceCss
    if (mode === 'bundle') {
      actualCss = sourceCss.replaceAll('(hover: hover)', 'not (hover:hover)')
    }
    if (mode === 'hex-bundle') {
      actualCss += `\n${equivalentSelectors[0]}{background-color:#ef4444}`
    }
    if (mode === 'group-retained') {
      actualCss += String.raw` .group-hover\:block{display:block}`
    }
    if (mode === 'peer-retained') {
      actualCss += String.raw` .peer-checked\:opacity-100{opacity:1}`
    }
    if (mode === 'metadata') {
      built.results.flatMap(item => item.candidates ?? []).find(candidate => candidate.className === MEDIA_GATE_CANDIDATES[0])!.mediaGuard!.generatedRules[0]!.selector = '.forged'
    }
    const actual = actualCss === sourceCss && mode !== 'disabled' ? encoded : await encodeLynxCss(actualCss, { applyCompatibility: false, enableCSSRule: mode !== 'disabled' })
    await fs.writeFile(path.join(directory, 'main.lynx.bundle'), actual.buffer)
    // 输入始终保留原来的正确 guard，不能代替上方故意篡改的实际二进制。
    await fs.writeFile(path.join(directory, 'tasm.json'), JSON.stringify(tasm))
    if (mode === 'none') {
      await expect(validateMediaGuardArtifacts(directory, built)).resolves.toBeUndefined()
    }
    else { await expect(validateMediaGuardArtifacts(directory, built)).rejects.toThrow(/必要 media guard|逐候选 encoder 拒绝/) }
  })
})

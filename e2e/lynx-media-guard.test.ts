import type { StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MEDIA_GATE_CANDIDATES, mediaGuardValid } from '../examples/react-lynx/src/compatibility/media-gate-contract'
import { validateMediaGateSources } from './lynx/media-gate-source'
import { validateMediaGuardArtifacts } from './lynx/media-guard-artifacts'
import { flattenEncodedRules, parseGeneratedRules, staticMediaGuard } from './lynx/static-evidence'

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
  it.each(['none', 'css', 'tasm', 'metadata'] as const)('从本轮产物重新验证 %s，不能信任报告 metadata', async (mode) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx media guard '))
    directories.push(directory)
    const built = build()
    await fs.writeFile(path.join(directory, 'main.css'), mode === 'css' ? `${css}\n${selectors[0]}{display:block}` : css)
    const encoded = structuredClone(tasm)
    if (mode === 'tasm') {
      encoded.css.cssMap.entry[0]!.prelude.value = 'not (hover:hover)'
    }
    if (mode === 'metadata') {
      built.results[0]!.candidates![0]!.mediaGuard!.generatedRules[0]!.selector = '.forged'
    }
    await fs.writeFile(path.join(directory, 'tasm.json'), JSON.stringify(encoded))
    if (mode === 'none') {
      await expect(validateMediaGuardArtifacts(directory, built)).resolves.toBeUndefined()
    }
    else { await expect(validateMediaGuardArtifacts(directory, built)).rejects.toThrow(/必要 media guard/) }
  })
})

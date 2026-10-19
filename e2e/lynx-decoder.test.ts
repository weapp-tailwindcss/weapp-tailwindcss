import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeLynxCss } from './lynx/batch-encode'
import { decodeLynxBundle, loadVerifiedDecoderFactory } from './lynx/decoder'
import identifierFixture from './lynx/decoder/fixtures/selector-identifiers.json'
import { parseDecodedRules, selectorHasCandidate } from './lynx/static-evidence'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('实际 Lynx bundle 的便携解码 oracle', () => {
  it('固定实际二进制的 17 条 class/id 文本符合独立 CSSOM 预期', async () => {
    const bundle = Buffer.from(identifierFixture.bundle.base64, 'base64')
    expect(bundle.byteLength).toBe(identifierFixture.bundle.bytes)
    expect(createHash('sha256').update(bundle).digest('hex')).toBe(identifierFixture.bundle.sha256)
    const decoded = await decodeLynxBundle(bundle)
    const rules = parseDecodedRules(decoded.css.text)
    expect(rules).toHaveLength(identifierFixture.expectedRules.length)
    for (const expected of identifierFixture.expectedRules) {
      const rule = rules.find(rule => rule.declarations.some(declaration => declaration.property === 'width' && declaration.value === expected.width))
      expect(rule?.selector).toBe(expected.selector)
      for (const candidate of expected.classes) {
        expect(selectorHasCandidate(rule!.selector, candidate)).toBe(true)
      }
    }
  })
  it('生产 encoder 的页面配置先于 CSSRule 解码，普通规则与媒体规则分别保留', async () => {
    const encoded = await encodeLynxCss('.a{height:16px;width:16px}@media(min-width:1px){.a{width:32px}}', { applyCompatibility: false })
    const decoded = await decodeLynxBundle(encoded.buffer)
    expect(JSON.parse(decoded['page-config']).enableCSSRule).toBe(true)
    const rules = parseDecodedRules(decoded.css.text)
    expect(rules).toContainEqual(expect.objectContaining({ selector: '.a', mediaConditions: [], declarations: expect.arrayContaining([{ property: 'height', value: '16px' }, { property: 'width', value: '16px' }]) }))
    expect(rules).toContainEqual(expect.objectContaining({ selector: '.a', mediaConditions: ['(min-width:1px)'], declarations: [{ property: 'width', value: '32px' }] }))
  })

  it('关闭 CSSRule 的实际二进制丢失媒体规则，即使 serializer 输入仍完整也不能通过', async () => {
    const encoded = await encodeLynxCss('.a{width:16px}@media(min-width:1px){.a{width:32px}}', { applyCompatibility: false, enableCSSRule: false })
    expect(JSON.stringify(encoded.rules)).toContain('32px')
    const rules = parseDecodedRules(encoded.css)
    expect(rules.some(rule => rule.mediaConditions?.length)).toBe(false)
    expect(rules.flatMap(rule => rule.declarations).some(declaration => declaration.value === '32px')).toBe(false)
  })

  it.each([
    ['aspect-[4/3]', String.raw`.aspect-\[4\/3\]`],
    ['max-h-[var(--panel-height)]', String.raw`.max-h-\[var\(--panel-height\)\]`],
    ['!shrink', String.raw`.\!shrink`],
    ['basis-1/2', String.raw`.basis-1\/2`],
    ['text-black/[.35]', String.raw`.text-black\/\[\.35\]`],
    ['content-[\'lynx\']', String.raw`.content-\[\'lynx\'\]`],
    ['[&_.target]:font-bold', String.raw`.\[\&_\.target\]\:font-bold .target`],
    ['中文', '.中文'],
    ['1a', String.raw`.\31 a`],
  ])('实际 bundle 中的 %s class 身份经 CSSOM 转义后不变', async (candidate, selector) => {
    const encoded = await encodeLynxCss(`${selector}{width:32px}`, { applyCompatibility: false })
    const rules = parseDecodedRules(encoded.css)
    expect(rules.some(rule => selectorHasCandidate(rule.selector, candidate) && rule.declarations.some(declaration => declaration.property === 'width' && declaration.value === '32px'))).toBe(true)
  })

  it.each([
    ':is(.probe)',
    ':where(.probe)',
    String.raw`.group-hover\:block:is(:where(.group):hover *)`,
    String.raw`.peer-checked\:opacity-100:is(:where(.peer):checked~*)`,
  ])('固定生产 encoder 拒绝 %s，并从实际 bundle 验证规则缺失', async (selector) => {
    const encoded = await encodeLynxCss(`@media(hover:hover){${selector}{width:32px}}`, { applyCompatibility: false })
    expect(encoded.diagnostics).toContainEqual(expect.objectContaining({ type: 'selector', name: selector }))
    expect(JSON.stringify(encoded.rules)).toContain('32px')
    expect(parseDecodedRules(encoded.css).flatMap(rule => rule.declarations)).toEqual([])
  })

  it.each(['gzip', 'patch'] as const)('拒绝篡改 %s，不加载任何替代 decoder', async (mode) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx decoder evidence '))
    directories.push(directory)
    const source = path.join(import.meta.dirname, 'lynx', 'decoder')
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'))
    const files: string[] = ['manifest.json', manifest.compressed.file, ...manifest.patches.map((patch: { file: string }) => patch.file)]
    for (const file of files) {
      const destination = path.resolve(directory, file)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(path.resolve(source, file), destination)
    }
    const target = path.resolve(directory, mode === 'gzip' ? manifest.compressed.file : manifest.patches[0].file)
    const bytes = await fs.readFile(target)
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
    await fs.writeFile(target, bytes)
    await expect(loadVerifiedDecoderFactory(directory)).rejects.toThrow(/SHA-256/)
  })
})

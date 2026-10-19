import type { Frame, Page } from 'playwright'
import type { AuthoringReference } from './tailwind-capabilities/authoring-web/reference'
import { describe, expect, it, vi } from 'vitest'
import { authoringFrameHtml, observeAuthoring } from './tailwind-capabilities/authoring-web/browser'
import { authoringWebProfiles } from './tailwind-capabilities/authoring-web/profiles'
import { buildAuthoringReference } from './tailwind-capabilities/authoring-web/reference'
import { cssDeclarations } from './tailwind-capabilities/css'

const profile = (id: string) => authoringWebProfiles.find(profile => profile.fixture.id === id)!

describe('源码与指令的官方隔离参考', () => {
  it('14个新增语义输入独立编译，逐候选存在具体声明和固定oracle身份', async () => {
    const profiles = authoringWebProfiles.filter(profile => profile.official)
    expect(profiles).toHaveLength(14)
    for (const item of profiles) {
      const reference = await buildAuthoringReference(item)
      expect(reference).toBeDefined()
      expect(reference!.identity.inputSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(reference!.identity.candidates).toEqual(item.official!.candidates)
      const parsed = cssDeclarations(reference!.css)
      for (const group of item.groups) {
        const declarations = group.sourceSelector ? parsed.bySelector.get(group.sourceSelector) : parsed.byClass.get(group.className)
        for (const expected of group.declarations) {
          expect(declarations?.some(declaration => declaration.property === expected.property && declaration.value), `${item.id}/${group.className}/${expected.property}`).toBe(true)
        }
      }
      expect(cssDeclarations(reference!.baselineCss).byClass.size).toBe(0)
    }
  })

  it('官方参考不消费产品CSS，扫描文件与显式候选不会被预期名单改写', async () => {
    const item = profile('scan-html-literal')
    const before = JSON.stringify(item.fixture)
    const reference = await buildAuthoringReference(item)
    expect(JSON.stringify(item.fixture)).toBe(before)
    expect(item.fixture.candidates).toEqual([])
    expect(item.fixture.files).toEqual({ 'probe.html': '<div class="p-4 w-[123px]"></div>' })
    const productCss = '.broken-product{width:999px}'
    const product = authoringFrameHtml(item, item.groups[0]!, 'product', productCss, true, reference)
    const independent = authoringFrameHtml(item, item.groups[0]!, 'reference', productCss, true, reference)
    const baseline = authoringFrameHtml(item, item.groups[0]!, 'baseline', productCss, true, reference)
    expect(product).toContain(productCss)
    expect(product).not.toContain(reference!.css)
    expect(independent).not.toContain(productCss)
    expect(independent).toContain(reference!.css)
    expect(independent).toContain('class="p-4"')
    expect(independent).not.toContain('padding:undefined')
    expect(baseline).not.toContain(productCss)
    expect(baseline).not.toContain(reference!.css)
    expect(baseline).toContain('class=""')
  })

  it('无效业务文字的对照有明确独立身份，不修改扫描或产品', async () => {
    const item = profile('scan-business-text')
    const reference = await buildAuthoringReference(item)
    expect(reference!.identity.oracle).toBe('isolated-official-tailwindcss-compile-with-declared-negative-control')
    expect(reference!.css).toContain('.keep-\\[business\\]{padding:17px}')
    expect(item.fixture.css).not.toContain('17px')
    expect(item.fixture.candidates).toEqual([])
    expect(item.groups[0]).toMatchObject({ className: 'keep-[business]', excluded: true })
  })

  it('hover/focus后立即读取对应文档，恢复复用同一产品文档', async () => {
    const item = profile('source-inline')
    const log: string[] = []
    const frames = item.groups.flatMap((_group, index) => ['product', 'reference', 'baseline'].map((role) => {
      const name = `${role}-${index}`
      return {
        name: () => name,
        setContent: vi.fn(async () => { log.push(`${name}/document`) }),
        locator: () => ({
          hover: async () => { log.push(`${name}/hover`) },
          focus: async () => { log.push(`${name}/focus`) },
        }),
        $eval: async (_selector: string, _callback: unknown, input?: { declarations?: unknown[], pseudo?: string }) => {
          if (input?.declarations) {
            log.push(`${name}/read`)
            return { values: ['rgb(1, 2, 3)'], supported: [true] }
          }
          log.push(`${name}/blur`)
        },
      }
    }))
    const setContent = vi.fn(async () => {})
    const page = { emulateMedia: async () => {}, setContent, frames: () => frames as unknown as Frame[], mouse: { move: async () => {} } } as unknown as Page
    const reference: AuthoringReference = { css: '.reference{}', baselineCss: '', identity: { oracle: 'test', inputSha256: 'a'.repeat(64), candidates: [] } }
    await observeAuthoring(page, item, '.product{}', 'before', reference)
    log.length = 0
    await observeAuthoring(page, item, '.product{}', 'after', reference)
    for (const [index, interaction] of ['hover', 'focus'].entries()) {
      expect(log.indexOf(`product-${index}/${interaction}`) + 1).toBe(log.indexOf(`product-${index}/read`))
      expect(log.indexOf(`product-${index}/read`)).toBeLessThan(log.indexOf(`reference-${index}/${interaction}`))
      expect(log.indexOf(`reference-${index}/${interaction}`) + 1).toBe(log.indexOf(`reference-${index}/read`))
    }
    log.length = 0
    await observeAuthoring(page, item, '.product{}', 'restored', reference)
    expect(log.some(entry => entry.endsWith('/hover') || entry.endsWith('/focus'))).toBe(false)
    expect(setContent).toHaveBeenCalledOnce()
    expect(frames.every(frame => frame.setContent.mock.calls.length === 1)).toBe(true)
    expect(profile('scan-hover-class').groups[1]!.pseudo).toBe('::after')
  })
})

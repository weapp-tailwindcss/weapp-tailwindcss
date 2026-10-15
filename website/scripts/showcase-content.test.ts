import type { ShowcaseSourceEntry } from '../../scripts/showcase/render'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { processMarkdownFile } from 'docusaurus-plugin-llms/lib/processor.js'
import { expect, it } from 'vitest'
import { renderShowcaseCatalog, renderShowcaseMarkdown, validateShowcaseLocalization } from '../../scripts/showcase/render'
import { localizeShowcaseEntry, showcaseAnchor, showcaseCatalog, showcaseEnglish } from '../src/components/docs/showcase/catalog'
import { checkShowcase, resolveShowcaseAsset } from './check-showcase.mts'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))

it('双语描述、标题全集与共享案例一致，所有共享图片真实存在', async () => {
  await checkShowcase(websiteRoot)
  expect(showcaseCatalog.entries).toHaveLength(14)
  expect(showcaseCatalog.entries.flatMap(entry => [entry.primaryImage, ...entry.screenshots])).toHaveLength(49)
})

it('本地化只改变展示文本，案例身份和图片 URL 保持原样', () => {
  for (const entry of showcaseCatalog.entries) {
    for (const locale of ['en', 'zh-cn'] as const) {
      const localized = localizeShowcaseEntry(entry, locale)
      expect(localized.id).toBe(entry.id)
      expect(localized.commentUrl).toBe(entry.commentUrl)
      expect(localized.primaryImage.src).toBe(entry.primaryImage.src)
      expect(localized.screenshots.map(image => image.src)).toEqual(entry.screenshots.map(image => image.src))
      expect(showcaseAnchor(localized.id)).toBe(`showcase-${entry.id}`)
      if (locale === 'en') {
        expect(JSON.stringify(localized)).toContain(showcaseEnglish[entry.id].title)
        expect([localized.title, localized.createdAt, localized.primaryImage.alt, ...localized.screenshots.map(image => image.alt)].join(' ')).not.toMatch(/[\u3400-\u9FFF]/)
      }
    }
  }
})

it.each([
  [path.posix, '/repo/static'],
  [path.posix, 'relative/static'],
  [path.win32, 'C:\\repo\\static'],
  [path.win32, '\\repo\\static'],
  [path.win32, 'relative\\static'],
])('逻辑 URL 只解码一次，再用 %s 对应的平台路径定位资源', (paths, root) => {
  const result = resolveShowcaseAsset(root, '/img/showcase/001.%E5%8C%BA%E7%99%BD%E7%99%BD/image%2520name.png', paths)
  expect(result).toBe(paths.resolve(root, 'img', 'showcase', '001.区白白', 'image%20name.png'))
  expect(() => resolveShowcaseAsset(root, 'https://other.test/img/showcase/file.png', paths)).toThrow('本地 static')
  expect(() => resolveShowcaseAsset(root, '/img/showcase/..%2F..%2F..%2Foutside.png', paths)).toThrow('越出 static')
})

it('生成器新增案例需要先补英文标题与描述，不允许遗留半套翻译', () => {
  const ids = showcaseCatalog.entries.map(entry => entry.id)
  const markdown = ids.map(id => `<ShowcaseCard entryId="${id}" />`).join('\n')
  validateShowcaseLocalization(ids, showcaseEnglish, markdown, [])
  expect(() => validateShowcaseLocalization([...ids, '9999999999'], showcaseEnglish, markdown, [])).toThrow('尚未清理图片或写入产物')
  expect(() => validateShowcaseLocalization([...ids, '9999999999'], showcaseEnglish, `${markdown}\n<ShowcaseCard entryId="9999999999" />`, [])).toThrow('英文标题')
  expect(() => validateShowcaseLocalization(ids, showcaseEnglish, `${markdown}\n<ShowcaseCard entryId="${ids[0]}" />`, [])).toThrow('英文描述')
  validateShowcaseLocalization([...ids, '9999999999'], { ...showcaseEnglish, 9999999999: { title: 'New showcase' } }, `${markdown}\n<ShowcaseCard entryId="9999999999" />`, [])
})

it('源案例有正文时拒绝英文自闭合、空正文或仅注释，源无正文时允许自闭合', () => {
  const ids = ['9999999999']
  const titles = { 9999999999: { title: 'New showcase' } }
  const selfClosing = '<ShowcaseCard entryId="9999999999" />'
  for (const markdown of [selfClosing, '<ShowcaseCard entryId="9999999999">\n \n</ShowcaseCard>', '<ShowcaseCard entryId="9999999999">\n<!-- 待翻译 -->\n</ShowcaseCard>']) {
    expect(() => validateShowcaseLocalization(ids, titles, markdown, ids)).toThrow('英文描述为空')
  }
  validateShowcaseLocalization(ids, titles, '<ShowcaseCard entryId="9999999999">\nTranslated description.\n</ShowcaseCard>', ids)
  validateShowcaseLocalization(ids, titles, selfClosing, [])
})

it('构建检查根据中文正文阻断英文空壳，先于图片资源检查失败', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'showcase-description-'))
  try {
    for (const directories of [['docs'], ['i18n', 'en', 'docusaurus-plugin-content-docs', 'current']]) {
      const directory = path.join(root, ...directories, 'showcase')
      await mkdir(directory, { recursive: true })
      const markdown = showcaseCatalog.entries.map((entry, index) => index === 0 && directories[0] === 'docs'
        ? `<ShowcaseCard entryId="${entry.id}">\n中文正文\n</ShowcaseCard>`
        : `<ShowcaseCard entryId="${entry.id}" />`).join('\n')
      await writeFile(path.join(directory, 'index.mdx'), markdown)
    }
    await expect(checkShowcase(root)).rejects.toThrow('英文描述为空')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('生成共享资源和中文正文时不复制本地化字段或改写资源地址', () => {
  const entries: ShowcaseSourceEntry[] = [{
    id: 9999999999,
    name: '测试案例',
    createdAt: '2026-10-16T00:00:00.000Z',
    commentUrl: 'https://github.com/example/repo/issues/1#issuecomment-9999999999',
    author: { login: 'example', html_url: 'https://github.com/example' },
    description: '保留 **Markdown** 描述。',
    images: [{ src: '/img/showcase/001.%E6%B5%8B%E8%AF%95/code.jpg', alt: '小程序码' }, { src: '/img/showcase/001.%E6%B5%8B%E8%AF%95/shot.png', alt: '截图' }],
  }]
  const issue = { title: '案例来源', html_url: 'https://github.com/example/repo/issues/1' }
  const catalog = renderShowcaseCatalog(issue.html_url, entries, '2026-10-16T00:00:00.000Z')
  expect(catalog.entries[0].primaryImage.src).toBe(entries[0].images[0].src)
  expect(catalog.entries[0].screenshots[0].src).toBe(entries[0].images[1].src)
  const markdown = renderShowcaseMarkdown(issue, entries)
  expect(markdown).toContain('<ShowcaseIndex />')
  expect(markdown).toContain('<ShowcaseCard entryId="9999999999">')
  expect(markdown).toContain(entries[0].description)
  expect(markdown).not.toContain('/img/showcase/')
  expect(markdown).not.toContain('title={')
  expect(markdown).toContain('<!-- 该文件由 scripts/update-showcase.ts 自动生成，维护命令：pnpm showcase:update。 -->')
})

it.each([
  ['docs'],
  ['i18n', 'en', 'docusaurus-plugin-content-docs', 'current'],
])('实际 MDX 导出保留介绍和案例描述，不把生成维护提示作为正文 (%j)', async (...directories) => {
  const docsRoot = path.join(websiteRoot, ...directories)
  const file = path.join(docsRoot, 'showcase', 'index.mdx')
  const markdown = await readFile(file, 'utf8')
  expect(markdown).not.toMatch(/(?:primaryImage|screenshots|commentUrl|href|generatedAt)\s*=/)
  const result = await processMarkdownFile(file, docsRoot, 'https://tw.weapp.dev/', 'docs', { siteDir: websiteRoot, excludeImports: true, removeDuplicateHeadings: true })
  if (!result) {
    throw new Error(`Showcase 文档未导出：${file}`)
  }
  expect(result.content).toContain('weapp-tailwindcss')
  expect(result.content).toContain('FamiHub')
  expect(result.content).toContain('support@crush.cafe')
  expect(result.content).not.toContain('pnpm showcase:update')
})

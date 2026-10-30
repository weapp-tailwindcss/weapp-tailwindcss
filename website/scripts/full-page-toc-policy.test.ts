import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loadWebsiteTocPolicies, readWebsiteTocMetadata } from '../tests/helpers/full-page/toc/site-policy.mts'
import { captureBuildIdentity } from './visual-baselines/identity'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'website-toc-policy-'))
  roots.push(root)
  const directory = path.join(root, '.docusaurus')
  await mkdir(directory)
  await writeFile(path.join(directory, 'docusaurus.config.mjs'), `/* generated */\nexport default ${JSON.stringify({ themeConfig: { navbar: { hideOnScroll: true }, tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 } } })};`)
  const metadata = async (plugin: string, file: string, value: unknown) => {
    const target = path.join(directory, `docusaurus-plugin-content-${plugin}`, 'default')
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, file), JSON.stringify(value))
  }
  return { root, directory, metadata }
}

it('docs/blog/pages使用构建metadata，frontmatter覆盖默认范围并保留navbar策略', async () => {
  const { root, metadata } = await fixture()
  await metadata('docs', 'doc.json', { source: '@site/docs/a.md', permalink: '/docs/a', frontMatter: { toc_max_heading_level: 4 } })
  await metadata('blog', 'post.json', { source: '@site/blog/b.md', permalink: '/blog/b', frontMatter: {} })
  await metadata('pages', 'page.json', { source: '@site/src/pages/c.md', permalink: '/c', frontMatter: { toc_min_heading_level: 3 } })
  const policies = await loadWebsiteTocPolicies(root)
  expect([...policies]).toEqual([
    ['/docs/a', { hideOnScroll: true, minHeadingLevel: 2, maxHeadingLevel: 4 }],
    ['/blog/b', { hideOnScroll: true, minHeadingLevel: 2, maxHeadingLevel: 3 }],
    ['/c', { hideOnScroll: true, minHeadingLevel: 3, maxHeadingLevel: 3 }],
  ])
  expect(policies.get('/unknown')).toBeUndefined()
})

it.each([
  { toc_min_heading_level: 5, toc_max_heading_level: 3 },
  { toc_max_heading_level: 7 },
  { toc_min_heading_level: '2' },
])('无效frontmatter不回落默认值：%j', async (frontMatter) => {
  const { root, metadata } = await fixture()
  await metadata('docs', 'doc.json', { source: '@site/docs/a.md', permalink: '/docs/a', frontMatter })
  await expect(loadWebsiteTocPolicies(root)).rejects.toThrow('范围无效')
})

it('重复路由或缺失frontmatter必须拒绝，不用任意一个metadata放行', async () => {
  const { root, metadata } = await fixture()
  const value = { source: '@site/docs/a.md', permalink: '/docs/a', frontMatter: {} }
  await metadata('docs', 'a.json', value)
  await metadata('blog', 'b.json', value)
  await expect(loadWebsiteTocPolicies(root)).rejects.toThrow('路由重复')
  await metadata('blog', 'b.json', { source: '@site/blog/b.md', permalink: '/blog/b' })
  await expect(loadWebsiteTocPolicies(root)).rejects.toThrow('缺少明确 frontmatter')
})

it('同页逻辑路径规范化编码与末尾斜杠，并拒绝规范化后的重复路由', async () => {
  const { root, metadata } = await fixture()
  await metadata('docs', 'a.json', { source: '@site/docs/a.md', permalink: '/docs/中文/', frontMatter: {} })
  expect((await loadWebsiteTocPolicies(root)).has('/docs/%E4%B8%AD%E6%96%87')).toBe(true)
  await metadata('blog', 'b.json', { source: '@site/blog/b.md', permalink: '/docs/%E4%B8%AD%E6%96%87', frontMatter: {} })
  await expect(loadWebsiteTocPolicies(root)).rejects.toThrow('路由重复')
})

it('缺失或不可解析的构建配置拒绝，不猜测navbar默认策略', async () => {
  const { root, directory } = await fixture()
  await writeFile(path.join(directory, 'docusaurus.config.mjs'), 'export default {unknown()}')
  await expect(loadWebsiteTocPolicies(root)).rejects.toThrow('纯 JSON 配置')
  await rm(path.join(directory, 'docusaurus.config.mjs'))
  await expect(loadWebsiteTocPolicies(root)).rejects.toHaveProperty('code', 'ENOENT')
})

it('身份覆盖实际读取的配置和路由metadata，不纳入未使用的生成临时文件', async () => {
  const { root, directory, metadata } = await fixture()
  const value = { source: '@site/docs/a.md', permalink: '/docs/a', frontMatter: {} }
  await metadata('docs', 'doc.json', value)
  await mkdir(path.join(root, 'build'))
  await writeFile(path.join(root, 'build', 'index.html'), '<main>same rendered output</main>')
  const first = (await readWebsiteTocMetadata(root)).digest
  const firstBuild = await captureBuildIdentity(root)
  await metadata('docs', 'unused.json', { transient: 'not content metadata' })
  expect((await readWebsiteTocMetadata(root)).digest).toBe(first)
  expect(await captureBuildIdentity(root)).toBe(firstBuild)
  await metadata('docs', 'doc.json', { ...value, frontMatter: { toc_max_heading_level: 4 } })
  const changed = (await readWebsiteTocMetadata(root)).digest
  expect(changed).not.toBe(first)
  expect(await captureBuildIdentity(root)).not.toBe(firstBuild)
  await writeFile(path.join(directory, 'docusaurus.config.mjs'), `export default ${JSON.stringify({ themeConfig: { navbar: { hideOnScroll: false }, tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 } } })};`)
  expect((await readWebsiteTocMetadata(root)).digest).not.toBe(changed)
})

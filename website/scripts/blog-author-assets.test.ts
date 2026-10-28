import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const root = fileURLToPath(new URL('../', import.meta.url))
const staticRoot = path.join(root, 'static')
const authorFiles = ['blog/authors.yml', 'i18n/en/docusaurus-plugin-content-blog/authors.yml']
const { normalizeImageUrl } = createRequire(import.meta.url)('@docusaurus/plugin-content-blog/lib/authors.js') as {
  normalizeImageUrl: (options: { imageURL: string, baseUrl: string }) => string
}

describe('博客作者头像的静态资源边界', () => {
  it.each([
    ['/', '/img/authors/sonofmagic.jpg'],
    ['/zh-cn/', '/zh-cn/img/authors/sonofmagic.jpg'],
    ['/project/', '/project/img/authors/sonofmagic.jpg'],
    ['/project/zh-cn/', '/project/zh-cn/img/authors/sonofmagic.jpg'],
  ])('Docusaurus 在 %s 下解析真实作者配置的头像', async (baseUrl, expected) => {
    for (const file of authorFiles) {
      const authors = YAML.parse(await readFile(path.join(root, file), 'utf8')) as Record<string, { image_url: string }>
      expect(normalizeImageUrl({ imageURL: authors.sonofmagic!.image_url, baseUrl })).toBe(expected)
    }
  })

  for (const file of authorFiles) {
    it(`${file} 的头像由本站提供且可以完整解码`, async () => {
      const authors = YAML.parse(await readFile(path.join(root, file), 'utf8')) as Record<string, { image_url?: string }>
      expect(Object.keys(authors).length).toBeGreaterThan(0)
      for (const author of Object.values(authors)) {
        expect(author.image_url).toBeTruthy()
        const origin = 'https://author-assets.example'
        const url = new URL(author.image_url!, origin)
        expect(url.origin).toBe(origin)
        expect(url.search).toBe('')
        expect(url.hash).toBe('')
        // 此处处理 URL 的逻辑路径，之后才转换为宿主文件系统路径。
        const logicalAsset = path.posix.relative('/', decodeURIComponent(url.pathname))
        const asset = await realpath(path.resolve(staticRoot, logicalAsset))
        const relative = path.relative(await realpath(staticRoot), asset)
        expect(relative).not.toBe('..')
        expect(relative.startsWith(`..${path.sep}`)).toBe(false)
        expect(path.isAbsolute(relative)).toBe(false)
        const image = sharp(await readFile(asset))
        const metadata = await image.metadata()
        expect(metadata.width).toBeGreaterThan(0)
        expect(metadata.height).toBeGreaterThan(0)
        const decoded = await image.raw().toBuffer({ resolveWithObject: true })
        expect(decoded.data.byteLength).toBe(decoded.info.width * decoded.info.height * decoded.info.channels)
      }
    })
  }
})

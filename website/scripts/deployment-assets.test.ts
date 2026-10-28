import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deploymentAssetPathname, getExpectedHashedAssets } from './deployment-assets'

const directories: string[] = []

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deployment-assets-'))
  directories.push(root)
  const build = path.join(root, 'build')
  for (const directory of [build, path.join(build, 'zh-cn')]) {
    await mkdir(path.join(directory, 'assets'), { recursive: true })
    await mkdir(path.join(directory, 'img', 'social'), { recursive: true })
    for (const locale of ['en', 'zh-cn']) {
      await writeFile(path.join(directory, 'img', 'social', `weapp-tailwindcss-${locale}.png`), locale)
    }
  }
  return { root, build }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('构建资源发现', () => {
  it('递归哈希 JS、CSS、字体、媒体及附属文件，并保留社交图片', async () => {
    const { build } = await fixture()
    const files = [
      ['js', 'main.123.js'],
      ['js', 'main.123.js.LICENSE.txt'],
      ['css', 'styles.123.css'],
      ['fonts', 'nested', 'text.123.woff2'],
      ['media', 'intro.123.webm'],
      ['images', '图标 #1%.svg'],
    ]
    for (const segments of files) {
      const filename = path.join(build, 'assets', ...segments)
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, segments.at(-1)!)
    }
    await mkdir(path.join(build, 'zh-cn', 'assets', 'js'))
    await writeFile(path.join(build, 'zh-cn', 'assets', 'js', 'main.js'), '中文构建')
    await writeFile(path.join(build, 'index.html'), '不属于构建资源目录')
    const assets = await getExpectedHashedAssets(build)
    expect(assets).toHaveLength(files.length + 5)
    for (const segments of files) {
      expect(assets).toContainEqual({
        pathname: `/assets/${segments.map(segment => encodeURIComponent(segment)).join('/')}`,
        sha256: createHash('sha256').update(segments.at(-1)!).digest('hex'),
      })
    }
    expect(assets).toContainEqual({
      pathname: '/zh-cn/assets/js/main.js',
      sha256: createHash('sha256').update('中文构建').digest('hex'),
    })
    expect(assets.map(asset => asset.pathname)).toEqual(expect.arrayContaining([
      '/img/social/weapp-tailwindcss-en.png',
      '/img/social/weapp-tailwindcss-zh-cn.png',
      '/zh-cn/img/social/weapp-tailwindcss-en.png',
      '/zh-cn/img/social/weapp-tailwindcss-zh-cn.png',
    ]))
  })

  it.each(['assets', path.join('assets', 'nested'), 'img', path.join('img', 'social'), path.join('zh-cn', 'assets')])('拒绝通过 %s 目录链接读取构建目录外的文件', async (relative) => {
    const { root, build } = await fixture()
    const outside = path.join(root, 'outside')
    await mkdir(outside)
    await writeFile(path.join(outside, 'stale.js'), '不属于本轮构建')
    const link = path.join(build, relative)
    await rm(link, { recursive: true, force: true })
    await symlink(outside, link, 'junction')
    await expect(getExpectedHashedAssets(build)).rejects.toThrow(/must be a real directory|must be a regular file or directory/)
  })
})

describe('文件系统到部署 URL 的边界', () => {
  it.each([
    [path.posix, '/site/build', '/site/build/assets/js/app #?%.js'],
    [path.win32, 'C:\\site\\build', 'C:\\site\\build\\assets\\js\\app #?%.js'],
    [path.posix, '/', '/assets/js/app #?%.js'],
    [path.win32, 'C:\\', 'C:\\assets\\js\\app #?%.js'],
    [path.posix, 'build', 'build/assets/js/app #?%.js'],
    [path.win32, 'build', 'build\\assets\\js\\app #?%.js'],
  ])('本地路径只在 URL 边界按片段编码（%s）', (paths, root, filename) => {
    const pathname = deploymentAssetPathname(root, filename, paths)
    expect(pathname).toBe('/assets/js/app%20%23%3F%25.js')
    const url = new URL(pathname, 'https://next.tw.weapp.dev')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })

  it.each([
    [path.posix, '/site/build', '/site/build-other/main.js'],
    [path.posix, '/site/build', '/site/build/../main.js'],
    [path.posix, '/site/build', '/site/build'],
    [path.win32, 'C:\\site\\build', 'C:\\site\\build-other\\main.js'],
    [path.win32, 'C:\\site\\build', 'D:\\site\\build\\main.js'],
  ])('拒绝构建目录外的路径（%s）', (paths, root, filename) => {
    expect(() => deploymentAssetPathname(root, filename, paths)).toThrow('outside the build directory')
  })
})

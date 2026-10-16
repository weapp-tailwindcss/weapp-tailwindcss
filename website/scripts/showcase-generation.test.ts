import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { verifyShowcaseImages } from '../../scripts/showcase/assets'
import { updateShowcase } from '../../scripts/update-showcase'
import { catalogAt, comment, download, fixture, issue, tree } from './showcase-generation.fixture'

type RankImages = NonNullable<NonNullable<Parameters<typeof updateShowcase>[0]>['rank']>

it('跳过下载按稳定 ID 复用已发布选择，名称与远端顺序变化不改变图片身份', async () => {
  const f = await fixture([2, 1])
  const loadSource = async () => ({ issue, comments: [comment(2, 'Renamed second', ['changed.png']), comment(1, 'Renamed first', ['reordered.png'])] })
  const noDownload = vi.fn(download)
  const rank = vi.fn<RankImages>(async images => images.reverse())
  const imagesBefore = await tree(f.imageRoot)
  await updateShowcase({ root: f.root, skipImages: true, loadSource, download: noDownload, rank })
  const catalog = await catalogAt(f.catalogFile)
  expect(catalog.entries.map(entry => entry.id)).toEqual(['1', '2'])
  expect(catalog.entries.map(entry => entry.primaryImage.src)).toEqual(['/img/showcase/old-1/code.png', '/img/showcase/old-2/code.png'])
  expect(catalog.entries[0].screenshots[0].src).toBe('/img/showcase/old-1/screen.png')
  expect(await tree(f.imageRoot)).toEqual(imagesBefore)
  expect(noDownload).not.toHaveBeenCalled()
  expect(rank).not.toHaveBeenCalled()
  expect(await readFile(f.markdownFile, 'utf8')).toContain('保留中文描述。')
})

it.each(['missing', 'new', 'remote', 'empty', 'duplicate', 'symlink'])('跳过下载遇到 %s 资产或身份时在任何产物改写之前失败', async (failure) => {
  const f = await fixture()
  if (failure === 'missing') {
    await rm(path.join(f.imageRoot, 'old-1', 'code.png'))
  }
  if (failure === 'empty') {
    await writeFile(path.join(f.imageRoot, 'old-1', 'code.png'), '')
  }
  if (failure === 'remote') {
    f.catalog.entries[0].primaryImage.src = 'https://images.invalid/remote.png'
  }
  if (failure === 'duplicate') {
    f.catalog.entries.push(f.catalog.entries[0])
  }
  if (failure === 'symlink') {
    const external = path.join(f.root, 'external')
    await mkdir(external)
    await writeFile(path.join(external, 'code.png'), 'outside image tree')
    await rm(path.join(f.imageRoot, 'old-1'), { recursive: true })
    await symlink(external, path.join(f.imageRoot, 'old-1'), process.platform === 'win32' ? 'junction' : 'dir')
  }
  await writeFile(f.catalogFile, JSON.stringify(f.catalog))
  const id = failure === 'new' ? 2 : 1
  await f.translations([id])
  const before = await tree(f.root)
  await expect(updateShowcase({ root: f.root, skipImages: true, loadSource: async () => ({ issue, comments: [comment(id)] }) })).rejects.toThrow()
  expect(await tree(f.root)).toEqual(before)
})

it('跳过下载支持已发布本地选择，不能按远端文件名猜测旧资源', async () => {
  const f = await fixture()
  const options = { root: f.root, skipImages: true, loadSource: async () => ({ issue, comments: [comment(1)] }) }
  await writeFile(f.configFile, JSON.stringify({ entries: { 'example-1': { images: ['screen.png', '/img/showcase/old-1/code.png'] } } }))
  await updateShowcase(options)
  expect((await catalogAt(f.catalogFile)).entries[0].primaryImage.src).toBe('/img/showcase/old-1/screen.png')
  await writeFile(f.configFile, JSON.stringify({ entries: { 'example-1': { images: ['https://images.invalid/1/first.png'] } } }))
  const before = await tree(f.root)
  await expect(updateShowcase(options)).rejects.toThrow('无法证明图片选择归属')
  expect(await tree(f.root)).toEqual(before)
})

it('翻译检查先于下载与改写，隐藏项无需下载或翻译', async () => {
  const f = await fixture()
  const loadSource = async () => ({ issue, comments: [comment(1), comment(2, 'Hidden')] })
  await writeFile(f.configFile, JSON.stringify({ entries: { hidden: { hidden: true } } }))
  const downloader = vi.fn(download)
  await writeFile(f.englishFile, '<ShowcaseCard entryId="1" />')
  const before = await tree(f.root)
  await expect(updateShowcase({ root: f.root, loadSource, download: downloader })).rejects.toThrow('英文描述为空')
  expect(downloader).not.toHaveBeenCalled()
  expect(await tree(f.root)).toEqual(before)
  await f.translations([1])
  await updateShowcase({ root: f.root, loadSource, download: downloader, rank: async images => images })
  expect(downloader).toHaveBeenCalledTimes(2)
  expect((await catalogAt(f.catalogFile)).entries.map(entry => entry.id)).toEqual(['1'])
})

it.each(['null', 'throw'])('正常下载任一图片失败 (%s) 时保全旧图片、目录与正文', async (failure) => {
  const f = await fixture()
  const before = await tree(f.root)
  await expect(updateShowcase({
    root: f.root,
    loadSource: async () => ({ issue, comments: [comment(1)] }),
    download: async (...args) => {
      if (args[3] === 1) {
        if (failure === 'throw') {
          throw new Error('fixture download rejected')
        }
        return null
      }
      return download(...args)
    },
    rank: async images => images,
  })).rejects.toThrow('图片下载失败')
  expect(await tree(f.root)).toEqual(before)
})

it('正常下载在隔离目录完成并保留排名及远端手动选择，发布后全部是可用本地资源', async () => {
  const f = await fixture([1, 2])
  await writeFile(f.configFile, JSON.stringify({ entries: { 'example-2': { images: ['https://images.invalid/2/second.png'] } } }))
  const rank = vi.fn<RankImages>(async (images) => {
    expect(images.every(image => image.localPath && !image.localPath.startsWith(f.imageRoot))).toBe(true)
    expect(await readFile(path.join(f.imageRoot, 'old-1', 'code.png'), 'utf8')).toBe('1:code.png:old')
    return images.reverse()
  })
  await updateShowcase({ root: f.root, loadSource: async () => ({ issue, comments: [comment(1), comment(2)] }), download, rank })
  const catalog = await catalogAt(f.catalogFile)
  expect(catalog.entries[0].primaryImage.src).toBe('/img/showcase/001.example-1/2.png')
  expect(catalog.entries[1].primaryImage.src).toBe('/img/showcase/002.example-2/2.png')
  expect(catalog.entries[1].screenshots).toEqual([])
  expect(rank).toHaveBeenCalledTimes(1)
  await verifyShowcaseImages(f.imageRoot, catalog.entries.flatMap(entry => [entry.primaryImage, ...entry.screenshots]))
  expect(Object.keys(await tree(f.root)).some(file => file.includes('.showcase-publication-'))).toBe(false)
  await expect(readFile(path.join(f.imageRoot, 'old-1', 'code.png'))).rejects.toThrow()
})

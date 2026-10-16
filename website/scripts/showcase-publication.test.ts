import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { publishShowcase } from '../../scripts/showcase/publication'
import { fixture, tree } from './showcase-generation.fixture'

const io = { rename, writeFile, rm }

async function preparation(f: Awaited<ReturnType<typeof fixture>>, imageRoot: string) {
  await mkdir(path.join(imageRoot, 'new'))
  await writeFile(path.join(imageRoot, 'new', 'code.png'), 'new-image')
  return {
    catalog: { ...f.catalog, entries: [{ ...f.catalog.entries[0], primaryImage: { src: '/img/showcase/new/code.png' }, screenshots: [] }] },
    markdown: 'new-markdown',
  }
}

it.each(['catalog-write', 'markdown-write', 'image-rename', 'catalog-rename', 'markdown-rename'])('发布遇到 %s 故障时完整保全或恢复三个旧产物', async (failure) => {
  const f = await fixture()
  const before = await tree(f.root)
  let writes = 0
  const operations = {
    ...io,
    writeFile: (async (...args) => {
      writes += 1
      if ((failure === 'catalog-write' && writes === 1) || (failure === 'markdown-write' && writes === 2)) {
        throw new Error(failure)
      }
      return writeFile(...args)
    }) as typeof writeFile,
    rename: async (source: Parameters<typeof rename>[0], target: Parameters<typeof rename>[1]) => {
      const name = path.basename(String(source))
      if ((failure === 'image-rename' && name === 'images') || (failure === 'catalog-rename' && name === 'catalog.json') || (failure === 'markdown-rename' && name === 'index.mdx')) {
        throw new Error(failure)
      }
      return rename(source, target)
    },
  }
  await expect(publishShowcase(f, imageRoot => preparation(f, imageRoot), operations)).rejects.toThrow(failure)
  expect(await tree(f.root)).toEqual(before)
})

it('回滚也失败时保留旧备份及原始错误，不能把恢复失败当成功', async () => {
  const f = await fixture()
  const operations = {
    ...io,
    rename: async (source: Parameters<typeof rename>[0], target: Parameters<typeof rename>[1]) => {
      if (path.basename(String(source)) === 'index.mdx') {
        throw new Error('publication failed')
      }
      if (path.basename(String(source)) === 'previous' && target === f.imageRoot) {
        throw new Error('rollback failed')
      }
      return rename(source, target)
    },
  }
  const error = await publishShowcase(f, imageRoot => preparation(f, imageRoot), operations).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.message).toContain('保留恢复目录')
  expect(error.errors.map((item: Error) => item.message)).toEqual(['publication failed', 'rollback failed'])
  const scratch = (await readdir(path.dirname(f.imageRoot))).filter(name => name.startsWith('.showcase-publication-'))
  expect(scratch).toHaveLength(1)
  expect(await readFile(path.join(path.dirname(f.imageRoot), scratch[0], 'previous', 'old-1', 'code.png'), 'utf8')).toBe('1:code.png:old')
  expect(await readFile(f.markdownFile, 'utf8')).toBe('old-markdown')
  expect(await readFile(f.catalogFile, 'utf8')).toBe(JSON.stringify(f.catalog))
})

it('清理等待全部临时目录结束，并保留生成错误及所有清理错误', async () => {
  const f = await fixture()
  let removals = 0
  const operations = {
    ...io,
    writeFile: (async () => { throw new Error('write failed') }) as typeof writeFile,
    rm: (async () => {
      removals += 1
      throw new Error(`cleanup ${removals}`)
    }) as typeof rm,
  }
  const before = await tree(f.imageRoot)
  const error = await publishShowcase(f, imageRoot => preparation(f, imageRoot), operations).catch(error => error)
  expect(removals).toBe(3)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors.map((item: Error) => item.message)).toEqual(['write failed', 'cleanup 1', 'cleanup 2', 'cleanup 3'])
  expect(await tree(f.imageRoot)).toEqual(before)
})

it('生成的新目录含远端 URL 时发布前拒绝，旧产物完整保留', async () => {
  const f = await fixture()
  const before = await tree(f.root)
  await expect(publishShowcase(f, async () => ({ catalog: { ...f.catalog, entries: [{ ...f.catalog.entries[0], primaryImage: { src: 'https://images.invalid/code.png' } }] }, markdown: 'new-markdown' }))).rejects.toThrow('本地 static')
  expect(await tree(f.root)).toEqual(before)
})

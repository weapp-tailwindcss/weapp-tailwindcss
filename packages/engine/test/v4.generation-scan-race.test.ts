import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as projectScan from '@/extraction/candidate-extractor/project'
import { createTailwindGenerationSession, resolveTailwindV4Source } from '@/v4'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(readFile).mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createFixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'generation-scan-race-')))
  roots.push(root)
  const source = await resolveTailwindV4Source({
    projectRoot: root,
    base: root,
    css: '@theme { --spacing: 0.25rem; } @tailwind utilities;',
  })
  return { root, session: createTailwindGenerationSession(source) }
}

describe('生成扫描的文件删除竞态', () => {
  it.each(['file', 'directory', 'replaced-directory'])('枚举后 %s 消失时保留其他候选，重建后重新生成', async (mode) => {
    const { root, session } = await createFixture()
    const directory = path.join(root, 'pages')
    const removedFile = path.join(directory, 'page.wxml')
    const stableFile = path.join(root, 'stable.wxml')
    await mkdir(directory)
    await writeFile(removedFile, '<view class="p-4" />')
    await writeFile(stableFile, '<view class="m-2" />')
    const request = { scanSources: [{ base: root, pattern: '**/*.wxml', negated: false }] }
    try {
      expect((await session.generate(request)).classSet).toContain('p-4')
      const enumerate = projectScan.resolveProjectSourceFiles
      vi.spyOn(projectScan, 'resolveProjectSourceFiles').mockImplementationOnce(async (options) => {
        const files = await enumerate(options)
        expect(files).toContain(removedFile)
        await rm(mode === 'file' ? removedFile : directory, { recursive: true })
        if (mode === 'replaced-directory') await writeFile(directory, '')
        return files
      })
      const removed = await session.generate(request)
      expect(removed.classSet).toEqual(new Set(['m-2']))
      expect(removed.fragments[0]?.root.toString()).not.toContain('.p-4')
      expect(removed.dependencies).toContain(removedFile)
      if (mode === 'replaced-directory') await rm(directory)
      await mkdir(directory, { recursive: true })
      await writeFile(removedFile, '<view class="p-8" />')
      const rebuilt = await session.generate(request)
      expect(rebuilt.classSet).toEqual(new Set(['m-2', 'p-8']))
      expect(rebuilt.fragments[0]?.root.toString()).toContain('.p-8')
      expect(rebuilt.fragments[0]?.root.toString()).not.toContain('.p-4')
    }
    finally {
      session.dispose()
    }
  })

  it.each(['EACCES', 'EIO'])('不吞掉 %s 读取错误', async (code) => {
    const { root, session } = await createFixture()
    const file = path.join(root, 'page.wxml')
    await writeFile(file, '<view class="p-4" />')
    const error = Object.assign(new Error(`read failed: ${code}`), { code })
    vi.mocked(readFile).mockRejectedValueOnce(error)
    try {
      await expect(session.generate({ scanSources: [{ base: root, pattern: '*.wxml', negated: false }] }))
        .rejects.toBe(error)
    }
    finally {
      session.dispose()
    }
  })
})

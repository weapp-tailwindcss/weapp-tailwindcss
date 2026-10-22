import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { CompilerRootStore } from '@/core/compiler/root-store'

describe('候选来源与编译依赖分别失效', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  it('WXML 候选修改及文件创建、删除时复用编译会话，并与全新生成结果一致', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-candidate-invalidation-'))
    directories.push(root)
    const file = path.join(root, 'view.wxml')
    const sourceOptions = {
      base: root,
      css: '@theme { --spacing: 0.25rem; }\n@tailwind utilities;\n@source "./*.wxml";',
    }
    const compiler = createCompiler()
    const request = { id: 'candidate-root', scanSources: true, sourceOptions, target: 'web' as const }
    try {
      await writeFile(file, '<view class="p-4" />')
      await compiler.generate(request)
      const created = path.join(root, 'created.wxml')
      const updates = [
        { file, classes: 'p-4 m-2' },
        { file, classes: 'm-2 w-[27px]' },
        { file, classes: 'w-[27px]' },
        { file, classes: '' },
        { file: created, classes: 'h-[39px]' },
        { file: created, classes: null },
        { file, classes: null },
      ]
      for (const update of updates) {
        if (update.classes === null) {
          await rm(update.file)
        }
        else {
          await writeFile(update.file, `<view class="${update.classes}" />`)
        }
        expect(compiler.invalidate([update.file])).toEqual(['candidate-root'])
        const actual = await compiler.generate(request)
        const control = createCompiler()
        try {
          const expected = await control.generate({ ...request, id: 'control', incrementalCache: false })
          expect(actual.css).toBe(expected.css)
          expect([...actual.classSet].sort()).toEqual([...expected.classSet].sort())
          expect(actual.cache.engine).toBe(true)
        }
        finally {
          await control.dispose()
        }
      }
    }
    finally {
      await compiler.dispose()
    }
  }, 30_000)

  it.each([
    { base: '/repo', file: '/repo/view.wxml', dependency: '/repo/theme.wxml' },
    { base: '/', file: '/view.wxml', dependency: '/theme.wxml' },
    { base: 'C:\\repo', file: 'C:\\repo\\view.wxml', dependency: 'C:\\repo\\theme.wxml' },
    { base: '.', file: path.resolve('view.wxml'), dependency: path.resolve('theme.wxml') },
  ])('精确依赖和 root 优先于候选 glob：$base', async ({ base, file, dependency }) => {
    const store = new CompilerRootStore(2)
    const entry = store.get('virtual:root?style')
    store.attachSources(entry, [{ base, pattern: '**/*.wxml', negated: false }])
    store.attachDependencies(entry, [dependency])
    try {
      expect(store.invalidate([file])).toEqual([entry.id])
      expect(entry.invalidation).toBe(1)
      expect(entry.engineInvalidation).toBe(0)
      expect(store.invalidate([file, dependency])).toEqual([entry.id])
      expect(entry.invalidation).toBe(2)
      expect(entry.engineInvalidation).toBe(1)
      expect(store.invalidate([dependency, file])).toEqual([entry.id])
      expect(entry.invalidation).toBe(3)
      expect(entry.engineInvalidation).toBe(2)
      expect(store.invalidate([entry.id])).toEqual([entry.id])
      expect(entry.invalidation).toBe(4)
      expect(entry.engineInvalidation).toBe(3)
    }
    finally {
      await store.dispose()
    }
  })
})

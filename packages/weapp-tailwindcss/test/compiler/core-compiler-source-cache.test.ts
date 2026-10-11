import type { Compiler, CompilerGenerateRequest } from '@/core/compiler'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { resolveTailwindV4Source } from '@/generator'

const theme = (spacing: number) => `@theme { --spacing: ${spacing}rpx; } @tailwind utilities;`

describe('compiler source content cache', () => {
  const compilers: Compiler[] = []
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()))
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  async function createCase(kind: 'source' | 'sourceOptions') {
    const compiler = createCompiler()
    compilers.push(compiler)
    const input = kind === 'source'
      ? { source: await resolveTailwindV4Source({ base: process.cwd(), css: theme(1) }) }
      : { sourceOptions: { base: process.cwd(), css: theme(1) } }
    const request: CompilerGenerateRequest = {
      ...input,
      id: 'theme-root',
      candidates: ['w-32'],
      scanSources: false,
      target: 'web',
      styleOptions: { cssCalc: ['--spacing'] },
    }
    return { compiler, input: input.source ?? input.sourceOptions!, request }
  }

  describe.each(['source', 'sourceOptions'] as const)('%s', (kind) => {
    it('regenerates an unchanged candidate set after an in-place theme edit', async () => {
      const { compiler, input, request } = await createCase(kind)
      const first = await compiler.generate(request)
      expect(first.css).toMatch(/width:\s*32rpx/)

      input.css = theme(2)
      const changed = await compiler.generate(request)
      expect(changed.css).toMatch(/width:\s*64rpx/)
      expect(changed.css).not.toMatch(/width:\s*32rpx/)
      expect(changed.cache).toEqual({ engine: false, output: false, source: false })

      const equivalent = await compiler.generate(structuredClone(request))
      expect(equivalent.css).toBe(changed.css)
      expect(equivalent.cache).toEqual({ engine: true, output: true, source: true })
    })

    it('uses the latest theme when candidates return after an empty generation', async () => {
      const { compiler, input, request } = await createCase(kind)
      const first = await compiler.generate(request)
      expect(first.css).toMatch(/width:\s*32rpx/)
      const empty = await compiler.generate({ ...request, candidates: [] })
      expect(empty.classSet.size).toBe(0)
      expect(empty.css).not.toMatch(/width:/)

      input.css = theme(2)
      const restored = await compiler.generate(request)
      expect(restored.css).toMatch(/width:\s*64rpx/)
      expect(restored.cache.engine).toBe(false)
    })

    it('rebuilds after explicit invalidation even when source content is equal', async () => {
      const { compiler, request } = await createCase(kind)
      const first = await compiler.generate(request)
      expect(compiler.invalidate([request.id])).toEqual([request.id])
      const invalidated = await compiler.generate(request)
      expect(invalidated.css).toBe(first.css)
      expect(invalidated.cache).toEqual({ engine: false, output: false, source: true })
      expect((await compiler.generate(request)).cache.output).toBe(true)
    })
  })

  it('detects in-place changes to nested cssSources', async () => {
    const { compiler, request } = await createCase('sourceOptions')
    if (!request.sourceOptions) {
      throw new Error('测试需要来源配置。')
    }
    const cssSource = { css: theme(1) }
    const sourceOptions = { base: process.cwd(), cssSources: [cssSource] }
    const generate = () => compiler.generate({ ...request, sourceOptions })
    expect((await generate()).css).toMatch(/width:\s*32rpx/)
    cssSource.css = theme(2)
    expect((await generate()).css).toMatch(/width:\s*64rpx/)
  })

  it('keeps the committed source isolated from subsequent caller mutations', async () => {
    const { compiler, request } = await createCase('source')
    if (!request.source) {
      throw new Error('测试需要解析后的来源。')
    }
    const original = structuredClone(request)
    const first = await compiler.generate(request)
    request.source.css = theme(2)
    request.source.dependencies.push('virtual:uncommitted-theme')
    const reused = await compiler.generate(original)
    expect(reused.css).toBe(first.css)
    expect(reused.cache).toEqual({ engine: true, output: true, source: true })
    expect(reused.dependencies).not.toContain('virtual:uncommitted-theme')
    expect(compiler.invalidate(['virtual:uncommitted-theme'])).toEqual([])
  })

  it.each(['/repo/theme.css', 'C:\\repo\\theme.css', 'C:\\', '/', './theme.css'])('refreshes nested dependency identity for %s', async (dependency) => {
    const { compiler, request } = await createCase('source')
    if (!request.source) {
      throw new Error('测试需要解析后的来源。')
    }
    await compiler.generate(request)
    request.source.dependencies.push(dependency)
    const changed = await compiler.generate(request)
    expect(changed.cache.source).toBe(false)
    expect(changed.dependencies).toContain(dependency)
    expect(compiler.invalidate([dependency])).toEqual([request.id])
  })

  it('re-resolves a file source after dependency invalidation', async () => {
    const { compiler, request } = await createCase('sourceOptions')
    if (!request.sourceOptions) {
      throw new Error('测试需要来源配置。')
    }
    const directory = await mkdtemp(path.join(tmpdir(), 'weapp-tw-compiler-source-cache-'))
    directories.push(directory)
    const entry = path.join(directory, 'theme.css')
    await writeFile(entry, theme(1))
    const sourceOptions = { cssEntries: [entry] }
    const generate = () => compiler.generate({ ...request, sourceOptions })
    expect((await generate()).css).toMatch(/width:\s*32rpx/)

    await writeFile(entry, theme(2))
    expect(compiler.invalidate([entry])).toEqual([request.id])
    const changed = await generate()
    expect(changed.css).toMatch(/width:\s*64rpx/)
    expect(changed.cache).toEqual({ engine: false, output: false, source: false })
  })
})

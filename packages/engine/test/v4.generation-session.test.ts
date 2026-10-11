import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as nodeAdapter from '@/v4/node-adapter'
import {
  createTailwindGenerationSession,
  createTailwindV4Engine,
  resolveTailwindV4Source,
} from '@/v4'

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(__dirname, '..')
const tailwindNodeBase = path.dirname(require.resolve('@tailwindcss/node'))
const tempDirs: string[] = []

async function createTempDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-engine-v4-session-'))
  tempDirs.push(tempDir)
  return tempDir
}

async function createDefaultSource(css = '@import "tailwindcss";') {
  return resolveTailwindV4Source({
    projectRoot: packageRoot,
    base: tailwindNodeBase,
    css,
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
})

describe('Tailwind generation session', () => {
  it('returns structured artifacts from explicit candidates and source entries', async () => {
    const session = createTailwindGenerationSession(await createDefaultSource())
    const artifact = await session.generate({
      candidates: ['text-red-500'],
      sourceEntries: [{
        id: 'virtual:page.html',
        extension: 'html',
        content: '<div class="bg-blue-500"></div>',
      }],
    })

    expect(artifact.classSet).toEqual(new Set(['text-red-500', 'bg-blue-500']))
    expect(artifact.rawCandidates).toContain('text-red-500')
    expect(artifact.rawCandidates).toContain('bg-blue-500')
    expect(artifact.sourceEntries).toEqual([{
      id: 'virtual:page.html',
      extension: 'html',
      content: '<div class="bg-blue-500"></div>',
    }])
    expect(artifact.fragments).toHaveLength(1)
    expect(artifact.fragments[0]?.kind).toBe('tailwind')
    expect(artifact.fragments[0]?.root.toString()).toContain('.text-red-500')
    expect(artifact.fragments[0]?.root.toString()).toContain('.bg-blue-500')
  })

  it('does not expose mutable AST or collection state across generations', async () => {
    const session = createTailwindGenerationSession(await createDefaultSource())
    const first = await session.generate({ candidates: ['text-red-500'] })

    first.fragments[0]?.root.removeAll()
    first.classSet.clear()
    first.rawCandidates.clear()
    first.dependencies.length = 0

    const second = await session.generate({ candidates: ['text-red-500'] })
    expect(second.fragments[0]?.root.toString()).toContain('.text-red-500')
    expect(second.classSet).toEqual(new Set(['text-red-500']))
    expect(second.rawCandidates).toEqual(new Set(['text-red-500']))
  })

  it('rebuilds the compiler when candidates are removed', async () => {
    const session = createTailwindGenerationSession(await createDefaultSource())
    const first = await session.generate({ candidates: ['text-red-500', 'bg-blue-500'] })
    const second = await session.generate({ candidates: ['text-red-500'] })

    expect(first.fragments[0]?.root.toString()).toContain('.bg-blue-500')
    expect(second.fragments[0]?.root.toString()).not.toContain('.bg-blue-500')
    expect(second.classSet).toEqual(new Set(['text-red-500']))
  })

  it('删除候选仅重建编译器，依赖失效仍刷新 design system', async () => {
    const loadDesignSystem = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const session = createTailwindGenerationSession(await createDefaultSource())
    try {
      await session.generate({ candidates: ['text-red-500', 'bg-blue-500'] })
      const removed = await session.generate({ candidates: ['text-red-500'] })
      expect(removed.fragments[0]?.root.toString()).not.toContain('.bg-blue-500')
      expect(loadDesignSystem).toHaveBeenCalledTimes(1)
      const restored = await session.generate({ candidates: ['text-red-500', 'bg-blue-500'] })
      expect(restored.fragments[0]?.root.toString()).toContain('.bg-blue-500')
      session.invalidate({ type: 'dependencies', paths: [] })
      await session.generate({ candidates: ['bg-blue-500'] })
      expect(loadDesignSystem).toHaveBeenCalledTimes(2)
    }
    finally {
      session.dispose()
      loadDesignSystem.mockRestore()
    }
  })

  it('invalidates the compiled source and design system together', async () => {
    const session = createTailwindGenerationSession(await createDefaultSource())
    const first = await session.generate({ candidates: ['text-red-500'] })
    session.invalidate({
      type: 'source',
      source: await createDefaultSource([
        '@import "tailwindcss";',
        '@source not inline("text-red-500");',
      ].join('\n')),
    })
    const second = await session.generate({ candidates: ['text-red-500'] })

    expect(first.classSet).toContain('text-red-500')
    expect(second.classSet).not.toContain('text-red-500')
  })

  it('refreshes imported CSS dependencies after invalidation', async () => {
    const tempDir = await createTempDir()
    const themeFile = path.join(tempDir, 'theme.css')
    await fs.writeFile(themeFile, '@theme { --color-brand: #ff0000; }', 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      base: tailwindNodeBase,
      css: [
        '@import "tailwindcss";',
        `@import "${themeFile}";`,
      ].join('\n'),
    })
    const session = createTailwindGenerationSession(source)
    const first = await session.generate({ candidates: ['bg-brand'] })

    await fs.writeFile(themeFile, '@theme { --color-brand: #0000ff; }', 'utf8')
    session.invalidate({ type: 'dependencies', paths: [themeFile] })
    const second = await session.generate({ candidates: ['bg-brand'] })

    expect(first.dependencies.some(dependency => path.basename(dependency) === 'theme.css')).toBe(true)
    expect(first.fragments[0]?.root.toString()).toContain('#ff0000')
    expect(second.fragments[0]?.root.toString()).toContain('#0000ff')
    expect(second.fragments[0]?.root.toString()).not.toContain('#ff0000')
  })

  it('rejects generation after disposal', async () => {
    const session = createTailwindGenerationSession(await createDefaultSource())
    session.dispose()

    await expect(session.generate()).rejects.toThrow('disposed')
  })

  it('keeps the legacy engine generate result compatible', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({ candidates: ['text-red-500'] })

    expect(result.css).toContain('.text-red-500')
    expect(result.classSet).toEqual(new Set(['text-red-500']))
    expect(result.rawCandidates).toEqual(new Set(['text-red-500']))
    expect(Array.isArray(result.dependencies)).toBe(true)
    expect(Array.isArray(result.sources)).toBe(true)
  })
})

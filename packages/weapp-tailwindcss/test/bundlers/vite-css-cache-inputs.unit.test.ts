import type { OutputBundle } from 'rollup'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '@/bundlers/vite/source-output-relations'
import { createContext, createRollupAsset, createRollupChunk } from './vite-plugin.testkit'

const { generateCss } = vi.hoisted(() => ({
  generateCss: vi.fn(async (options: { runtime: Set<string> }) => ({
    css: [...options.runtime].sort().map(candidate => `.${candidate}{color:red}`).join('\n'),
    classSet: new Set(options.runtime),
    dependencies: [],
    target: 'weapp',
  })),
}))

vi.mock('@/context/generation', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/context/generation')>(),
  generateTailwindV4Css: generateCss,
}))

function createFixture(options: { trace?: boolean, source?: string } = {}) {
  const candidates = new Set(['flex'])
  const sourceFiles = new Set([path.resolve('views', 'first.vue')])
  const relations = createViteSourceOutputRelationOwner()
  const context = createContext({
    cssSourceTrace: options.trace ?? false,
    tailwindRuntime: {
      options: {
        projectRoot: process.cwd(),
        tailwindcss: {
          cwd: process.cwd(),
          v4: { cssSources: [], css: '@tailwind utilities;' },
        },
      },
    },
  })
  const generateBundle = withViteSourceOutputRelationOwner(relations, () => createGenerateBundleHook({
    opts: context as any,
    runtimeState: {
      tailwindRuntime: context.tailwindRuntime,
      readyPromise: Promise.resolve(),
    },
    ensureRuntimeClassSet: async () => new Set(candidates),
    ensureBundleRuntimeClassSet: async () => new Set(candidates),
    getSourceCandidates: () => new Set(candidates),
    getSourceCandidatesForEntries: () => new Set(candidates),
    getSourceCandidateSourcesForEntries: () => new Map([...candidates].map(candidate => [candidate, new Set(sourceFiles)])),
    debug: vi.fn(),
    getResolvedConfig: () => ({
      command: 'build',
      root: process.cwd(),
      build: { outDir: process.cwd(), watch: {} },
      css: { postcss: { plugins: [] } },
    } as any),
  }))
  const createBundle = (label = 'first', partial = false): OutputBundle => ({
    'theme.css': { ...createRollupAsset(options.source ?? '@tailwind utilities;'), fileName: 'theme.css' },
    ...(partial ? {} : {
      'view.wxml': { ...createRollupAsset(`<view class="${[...candidates].join(' ')}" data-label="${label}" />`), fileName: 'view.wxml', originalFileNames: [...sourceFiles] },
      'view.js': { ...createRollupChunk(`console.log("${label}")`), fileName: 'view.js', facadeModuleId: [...sourceFiles][0] },
    }),
  })
  const run = async (label?: string, partial = false) => {
    const bundle = createBundle(label, partial)
    await generateBundle.call({ addWatchFile: vi.fn() }, {}, bundle)
    return String((bundle['theme.css'] as { source: string }).source)
  }
  return { candidates, context, relations, run, sourceFiles }
}

describe('vite css cache transformation inputs', () => {
  beforeEach(() => {
    generateCss.mockClear()
  })

  it('keeps generated CSS cached when unrelated template attributes and business strings change', async () => {
    const { run } = createFixture()
    const first = await run()
    expect(await run('second')).toBe(first)
    expect(await run('third')).toBe(first)
    expect(generateCss).toHaveBeenCalledTimes(1)
  })

  it('keeps custom style transformations cached across unrelated source changes', async () => {
    const { context, run } = createFixture({ source: '.custom{color:red}' })
    const first = await run()
    expect(await run('second')).toBe(first)
    expect(context.styleHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps generated CSS cached when template classes reorder within the same candidate set', async () => {
    const { candidates, run } = createFixture()
    candidates.add('grid')
    const first = await run()
    candidates.delete('flex')
    candidates.add('flex')
    expect(await run()).toBe(first)
    expect(generateCss).toHaveBeenCalledTimes(1)
  })

  it('invalidates candidate additions and deletions without oscillating on partial bundle recovery', async () => {
    const { candidates, run } = createFixture()
    expect(await run()).toContain('.flex')
    candidates.add('grid')
    expect(await run('added')).toContain('.grid')
    candidates.delete('flex')
    const removed = await run('removed')
    expect(removed).not.toContain('.flex')
    expect(removed).toContain('.grid')
    expect(await run(undefined, true)).toBe(removed)
    expect(await run('removed')).toBe(removed)
    expect(generateCss).toHaveBeenCalledTimes(3)
  })

  it('invalidates unchanged candidates when generation configuration changes', async () => {
    const { context, run } = createFixture()
    await run()
    context.tailwindRuntime.options.tailwindcss.v4.css = '@theme { --color-brand: red; }\n@tailwind utilities;'
    await run()
    expect(generateCss).toHaveBeenCalledTimes(2)
  })

  it('removes generated classes when their source is explicitly deleted from an incremental bundle', async () => {
    const { candidates, relations, run, sourceFiles } = createFixture()
    expect(await run()).toContain('.flex')
    for (const source of sourceFiles) {
      relations.removeSource(source)
    }
    candidates.clear()
    sourceFiles.clear()
    const deleted = await run(undefined, true)
    expect(deleted).not.toContain('.flex')
    expect(await run(undefined, true)).toBe(deleted)
    expect(generateCss).toHaveBeenCalledTimes(2)
  })

  it('invalidates unchanged candidates when their source annotation moves', async () => {
    const { run, sourceFiles } = createFixture({ trace: true })
    expect(await run()).toContain('views/first.vue')
    sourceFiles.clear()
    sourceFiles.add(path.resolve('views', 'second.vue'))
    const css = await run()
    expect(css).toContain('views/second.vue')
    expect(css).not.toContain('views/first.vue')
    expect(generateCss).toHaveBeenCalledTimes(2)
  })
})

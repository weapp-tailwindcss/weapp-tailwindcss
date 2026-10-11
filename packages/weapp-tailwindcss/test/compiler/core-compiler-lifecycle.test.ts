import { afterEach, describe, expect, it, vi } from 'vitest'

const sourceA = {
  base: '/workspace',
  baseFallbacks: [],
  css: '@tailwind utilities;',
  dependencies: [],
  projectRoot: 'source-a',
}
const sourceB = { ...sourceA, projectRoot: 'source-b' }

function generated(candidates: Iterable<string> = [], target = 'weapp') {
  const classSet = new Set(candidates)
  return {
    classSet,
    css: [...classSet].join(' '),
    dependencies: [],
    rawCandidates: classSet,
    rawCss: [...classSet].join(' '),
    root: null,
    sources: [],
    target,
  }
}

describe('createCompiler lifecycle', () => {
  afterEach(() => {
    vi.doUnmock('@/generator')
    vi.doUnmock('@/context')
    vi.resetModules()
  })

  it('serializes one root while allowing another root to generate concurrently', async () => {
    const starts: string[] = []
    let releaseFirst: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => ({
        dispose: vi.fn(),
        generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
          starts.push(source.projectRoot)
          if (source.projectRoot === 'source-a' && starts.filter(id => id === 'source-a').length === 1) {
            await blocked
          }
          return generated(options.candidates, options.target)
        },
        source,
        validateCandidates: vi.fn(),
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const first = compiler.generate({ candidates: ['p-4'], id: 'root-a', source: sourceA as any })
    const second = compiler.generate({ candidates: ['m-2'], id: 'root-a', source: sourceA as any })
    const parallel = compiler.generate({ candidates: ['text-sm'], id: 'root-b', source: sourceB as any })

    await vi.waitFor(() => expect(starts).toEqual(['source-a', 'source-b']))
    await expect(parallel).resolves.toMatchObject({ revision: 1 })
    releaseFirst?.()
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect([firstResult.revision, secondResult.revision]).toEqual([1, 2])
    expect(starts).toEqual(['source-a', 'source-b', 'source-a'])

    await compiler.dispose()
  })

  it('keeps the previous successful engine after a replacement fails', async () => {
    const disposals = new Map<string, ReturnType<typeof vi.fn>>()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => {
        const dispose = vi.fn()
        disposals.set(source.projectRoot, dispose)
        return {
          dispose,
          generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
            if (source.projectRoot === 'source-b') {
              throw new Error('generation failed')
            }
            return generated(options.candidates, options.target)
          },
          source,
          validateCandidates: vi.fn(),
        }
      },
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const first = await compiler.generate({ candidates: ['p-4'], id: 'root', source: sourceA as any })
    await expect(compiler.generate({ candidates: ['m-2'], id: 'root', source: sourceB as any })).rejects.toThrow('generation failed')
    expect(disposals.get('source-a')).not.toHaveBeenCalled()
    expect(disposals.get('source-b')).toHaveBeenCalledTimes(1)

    const recovered = await compiler.generate({ candidates: ['m-2'], id: 'root', source: sourceA as any })
    expect(first.revision).toBe(1)
    expect(recovered.revision).toBe(2)
    expect(recovered.cache.engine).toBe(true)
    await compiler.dispose()
    expect(disposals.get('source-a')).toHaveBeenCalledTimes(1)
  })

  it('replaces the engine after exact dependency invalidation', async () => {
    const generations = vi.fn()
    const disposals: Array<ReturnType<typeof vi.fn>> = []
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => {
        const dispose = vi.fn()
        disposals.push(dispose)
        return {
          dispose,
          generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
            generations()
            return generated(options.candidates, options.target)
          },
          source,
          validateCandidates: vi.fn(),
        }
      },
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const source = { ...sourceA, dependencies: ['virtual:theme'] }
    const request = { candidates: ['p-4'], id: 'root', source: source as any }

    await compiler.generate(request)
    expect(compiler.invalidate(['virtual:theme'])).toEqual(['root'])
    const regenerated = await compiler.generate(request)

    expect(regenerated.cache).toMatchObject({ engine: false, output: false })
    expect(generations).toHaveBeenCalledTimes(2)
    expect(disposals[0]).toHaveBeenCalledTimes(1)
    await compiler.dispose()
    expect(disposals[1]).toHaveBeenCalledTimes(1)
  })

  it('reuses equal generation options and detects in-place option changes', async () => {
    const generate = vi.fn(async (options: { candidates?: Iterable<string>, target?: string }) => generated(options.candidates, options.target))
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => ({
        dispose: vi.fn(),
        generate,
        source,
        validateCandidates: vi.fn(),
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const styleOptions = { isMainChunk: true }
    const request = {
      candidates: ['p-4'],
      id: 'root',
      source: sourceA as any,
    }

    await compiler.generate({ ...request, styleOptions })
    const reused = await compiler.generate({
      ...request,
      styleOptions: { isMainChunk: true },
    })
    styleOptions.isMainChunk = false
    const changed = await compiler.generate({ ...request, styleOptions })

    expect(reused.cache.output).toBe(true)
    expect(changed.cache.output).toBe(false)
    expect(generate).toHaveBeenCalledTimes(2)
    await compiler.dispose()
  })

  it('waits for active work and rejects new work while disposing', async () => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = vi.fn()
    const disposeGenerator = vi.fn()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => ({
        dispose: disposeGenerator,
        generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
          started()
          await blocked
          return generated(options.candidates, options.target)
        },
        source,
        validateCandidates: vi.fn(),
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const generation = compiler.generate({ candidates: ['p-4'], id: 'root', source: sourceA as any })
    await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(1))
    let disposed = false
    const disposal = compiler.dispose().then(() => {
      disposed = true
    })

    await Promise.resolve()
    expect(disposed).toBe(false)
    expect(() => compiler.generate({ candidates: [], id: 'late', source: sourceA as any })).toThrow('正在释放')
    release?.()
    await expect(generation).resolves.toMatchObject({ revision: 1 })
    await disposal
    expect(disposeGenerator).toHaveBeenCalledTimes(1)
  })

  it('bounds idle root sessions and releases evicted generators', async () => {
    const disposals = new Map<string, ReturnType<typeof vi.fn>>()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => {
        const dispose = vi.fn()
        disposals.set(source.projectRoot, dispose)
        return {
          dispose,
          generate: async (options: { candidates?: Iterable<string>, target?: string }) => generated(options.candidates, options.target),
          source,
          validateCandidates: vi.fn(),
        }
      },
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler({ compiler: { maxRoots: 1 } })

    await compiler.generate({ candidates: ['p-4'], id: 'root-a', source: sourceA as any })
    await compiler.generate({ candidates: ['m-2'], id: 'root-b', source: sourceB as any })
    await vi.waitFor(() => expect(disposals.get('source-a')).toHaveBeenCalledTimes(1))
    expect(disposals.get('source-b')).not.toHaveBeenCalled()

    await compiler.dispose()
    expect(disposals.get('source-b')).toHaveBeenCalledTimes(1)
  })

  it('notifies after automatic root eviction but not explicit removal', async () => {
    const evicted = vi.fn()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => ({
        dispose: vi.fn(),
        generate: async (options: { candidates?: Iterable<string>, target?: string }) => generated(options.candidates, options.target),
        source,
        validateCandidates: vi.fn(),
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler({ compiler: { maxRoots: 1, onRootEvicted: evicted } })

    await compiler.generate({ candidates: ['p-4'], id: 'root-a', source: sourceA as any })
    await compiler.generate({ candidates: ['m-2'], id: 'root-b', source: sourceB as any })
    await vi.waitFor(() => expect(evicted).toHaveBeenCalledWith('root-a'))
    await compiler.remove('root-b')
    expect(evicted).toHaveBeenCalledTimes(1)
    await compiler.dispose()
  })

  it('passes template filename context to custom handlers', async () => {
    const templateHandler = vi.fn(async (source: string) => source)
    vi.doMock('@/context', () => ({
      getCompilerContext: () => ({
        jsHandler: vi.fn(),
        styleHandler: Object.assign(vi.fn(), { transformRoot: vi.fn() }),
        templateHandler,
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const snapshot = compiler.createSnapshot({ classSet: [], id: 'template-root' })

    await compiler.transformTemplate('<view />', snapshot, { filename: '/repo/src/pages/index.wxml' })
    expect(templateHandler).toHaveBeenCalledWith('<view />', expect.objectContaining({ filename: '/repo/src/pages/index.wxml' }))
    await compiler.dispose()
  })

  it('returns to the root limit after parallel work settles', async () => {
    let releaseFirst: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const disposals = new Map<string, ReturnType<typeof vi.fn>>()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => {
        const dispose = vi.fn()
        disposals.set(source.projectRoot, dispose)
        return {
          dispose,
          generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
            if (source.projectRoot === 'source-a') {
              await blocked
            }
            return generated(options.candidates, options.target)
          },
          source,
          validateCandidates: vi.fn(),
        }
      },
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler({ compiler: { maxRoots: 1 } })
    const first = compiler.generate({ candidates: ['p-4'], id: 'root-a', source: sourceA as any })
    await Promise.resolve()
    await compiler.generate({ candidates: ['m-2'], id: 'root-b', source: sourceB as any })

    await vi.waitFor(() => expect(disposals.get('source-b')).toHaveBeenCalledTimes(1))
    releaseFirst?.()
    await first
    await compiler.dispose()
    expect(disposals.get('source-a')).toHaveBeenCalledTimes(1)
  })

  it('shares one release for concurrent remove calls and rejects replacement work', async () => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const disposeGenerator = vi.fn()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: (source: typeof sourceA) => ({
        dispose: disposeGenerator,
        generate: async (options: { candidates?: Iterable<string>, target?: string }) => {
          await blocked
          return generated(options.candidates, options.target)
        },
        source,
        validateCandidates: vi.fn(),
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const generation = compiler.generate({ candidates: ['p-4'], id: 'root', source: sourceA as any })
    await Promise.resolve()
    const removals = [compiler.remove('root'), compiler.remove('root')]

    expect(() => compiler.generate({ candidates: [], id: 'root', source: sourceA as any })).toThrow('正在移除')
    release?.()
    await generation
    await Promise.all(removals)
    expect(disposeGenerator).toHaveBeenCalledTimes(1)
    await compiler.dispose()
  })
})

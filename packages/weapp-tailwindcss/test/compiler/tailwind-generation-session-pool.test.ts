import { afterEach, describe, expect, it, vi } from 'vitest'

const source = {
  projectRoot: '/workspace',
  base: '/workspace',
  baseFallbacks: [],
  css: '@import "tailwindcss";',
  dependencies: [],
}

describe('tailwind generation session pool', () => {
  afterEach(() => {
    vi.doUnmock('@/generator/runtime')
    vi.resetModules()
  })

  it('reuses generators by source fingerprint and disposes invalidated entries', async () => {
    const generate = vi.fn(async () => ({ css: '', rawCss: '', classSet: new Set(), rawCandidates: new Set(), dependencies: [], sources: [], root: null, target: 'web' }))
    const dispose = vi.fn()
    const createGenerator = vi.fn(() => ({ dispose, generate, validateCandidates: vi.fn(), source }))
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: createGenerator,
    }))
    const { TailwindGenerationSessionPool } = await import('@/compiler/tailwind-generation-session-pool')
    const pool = new TailwindGenerationSessionPool()

    await pool.generate(source as any)
    await pool.generate({ ...source } as any)
    expect(createGenerator).toHaveBeenCalledTimes(1)

    pool.invalidate({ type: 'source', source: source as any })
    expect(dispose).toHaveBeenCalledTimes(1)
    await pool.generate(source as any)
    expect(createGenerator).toHaveBeenCalledTimes(2)

    pool.invalidate({ type: 'dependencies', paths: ['/workspace/tailwind.config.js'] })
    expect(dispose).toHaveBeenCalledTimes(2)
    await pool.generate(source as any)
    expect(createGenerator).toHaveBeenCalledTimes(3)
  })

  it('rejects work and disposes generators after pool disposal', async () => {
    const dispose = vi.fn()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        dispose,
        generate: vi.fn(),
        validateCandidates: vi.fn(),
        source,
      })),
    }))
    const { TailwindGenerationSessionPool } = await import('@/compiler/tailwind-generation-session-pool')
    const pool = new TailwindGenerationSessionPool()
    await pool.generate(source as any)
    pool.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
    await expect(pool.generate(source as any)).rejects.toThrow('已释放')
  })
})

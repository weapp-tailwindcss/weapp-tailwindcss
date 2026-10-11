import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractProjectCandidatesWithPositions = vi.fn()
const resolveValidTailwindV4Candidates = vi.fn()
const loadTailwindV4DesignSystem = vi.fn()
const resolveTailwindV4SourceFromRuntime = vi.fn()
const loggerWarn = vi.fn()
const loggerError = vi.fn()

vi.mock('@weapp-tailwindcss/engine', () => ({
  extractProjectCandidatesWithPositions,
  resolveValidTailwindV4Candidates,
}))

vi.mock('@/tailwindcss/v4-engine', () => ({
  loadTailwindV4DesignSystem,
  resolveTailwindV4SourceFromRuntime,
}))

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: loggerError,
    info: vi.fn(),
    success: vi.fn(),
    warn: loggerWarn,
  },
}))

async function loadRuntimeFactory() {
  vi.resetModules()
  return import('@/tailwindcss/runtime-factory')
}

describe('tailwindcss runtime factory internals', () => {
  beforeEach(() => {
    extractProjectCandidatesWithPositions.mockReset()
    resolveValidTailwindV4Candidates.mockReset()
    loadTailwindV4DesignSystem.mockReset()
    resolveTailwindV4SourceFromRuntime.mockReset()
    loggerWarn.mockReset()
    loggerError.mockReset()
  })

  it('logs unable-to-locate tailwind errors and rethrows unknown engine failures', async () => {
    const { createTailwindcssRuntime } = await loadRuntimeFactory()

    expect(() => createTailwindcssRuntime({
      tailwindcss: {
        packageName: 'tailwindcss',
        postcssPlugin: 'tailwindcss',
        resolve: {
          paths: [],
        },
      },
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          packageName: 'tailwindcss',
          postcssPlugin: 'tailwindcss',
        },
      },
    })).not.toThrow()

    expect(() => createTailwindcssRuntime({
      tailwindcss: {
        packageName: 'tailwindcss',
        postcssPlugin: 'tailwindcss',
      },
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          packageName: 'tailwindcss',
          postcssPlugin: 'tailwindcss',
        },
      },
    })).not.toThrow()
  })

  it('collects v4 candidates, apply utilities, filters output, and caches class sets', async () => {
    extractProjectCandidatesWithPositions.mockResolvedValue({
      entries: [
        { rawCandidate: 'text-red-500' },
        '*',
        { rawCandidate: '' },
      ],
      filesScanned: 2,
      skippedFiles: ['dist'],
    })
    resolveTailwindV4SourceFromRuntime.mockResolvedValue({
      base: '/project',
      baseFallbacks: ['/project'],
      css: '@reference "tailwindcss";\n.card{@apply flex !important}',
      cssSources: [
        { css: '@reference "tailwindcss";\n.from-source{@apply grid}' },
        { css: '.bare-source{@apply bg-[#123456]}' },
        { css: '.broken{' },
      ],
      projectRoot: '/project',
      sources: ['src/**/*'],
    })
    loadTailwindV4DesignSystem.mockResolvedValue({ design: true })
    resolveValidTailwindV4Candidates.mockReturnValue(['text-red-500', '*'])
    const { createTailwindcssRuntime } = await loadRuntimeFactory()

    const runtime = createTailwindcssRuntime({
      tailwindcssRuntimeOptions: {
        filter: className => className !== 'grid',
        tailwindcss: {
          packageName: 'tailwindcss',
          version: 4,
          v4: { bareArbitraryValues: { units: ['px'] } },
        },
      },
    })

    expect(runtime.getClassSetSync?.()).toEqual(new Set())
    const extracted = await runtime.extract({ removeUniversalSelector: true, write: false })

    expect(resolveValidTailwindV4Candidates).toHaveBeenCalledWith(
      { design: true },
      expect.any(Set),
      { bareArbitraryValues: { units: ['px'] } },
    )
    expect(extracted.classSet.has('text-red-500')).toBe(true)
    expect(extracted.classSet.has('flex')).toBe(true)
    expect(extracted.classSet.has('grid')).toBe(false)
    expect(extracted.classSet.has('bg-[#123456]')).toBe(false)
    expect(extracted.classSet.has('*')).toBe(false)
    expect(runtime.getClassSetSync?.().has('text-red-500')).toBe(true)
    await expect(runtime.collectContentTokens?.()).resolves.toMatchObject({
      filesScanned: 2,
      sources: ['src/**/*'],
      skippedFiles: ['dist'],
    })
  })

  it('falls back to an empty runtime when the engine cannot find tailwindcss', async () => {
    vi.doMock('@/tailwindcss/runtime-resolve', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/runtime-resolve')>()
      let firstResolve = true
      return {
        ...actual,
        resolveModuleFromPaths: vi.fn((specifier: string | undefined) => {
          if (firstResolve && specifier === 'tailwindcss/package.json') {
            firstResolve = false
            throw new Error('tailwindcss not found')
          }
          return undefined
        }),
      }
    })
    const { createTailwindcssRuntime } = await loadRuntimeFactory()

    const runtime = createTailwindcssRuntime({
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          packageName: 'tailwindcss',
          version: 4,
          postcssPlugin: {} as any,
        },
      },
    })

    await expect(runtime.getClassSet()).resolves.toEqual(new Set())
    await expect(runtime.extract()).resolves.toMatchObject({
      classList: [],
      classSet: new Set(),
    })
    await expect(runtime.collectContentTokens?.()).resolves.toEqual({
      entries: [],
      filesScanned: 0,
      skippedFiles: [],
      sources: [],
    })
    expect(runtime.majorVersion).toBe(4)
    expect(loggerWarn).toHaveBeenCalledTimes(1)
  })

  it('logs unable-to-locate tailwindcss errors before rethrowing', async () => {
    vi.doMock('@/tailwindcss/runtime-resolve', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/runtime-resolve')>()
      return {
        ...actual,
        resolveModuleFromPaths: vi.fn((specifier: string | undefined) => {
          if (specifier === 'tailwindcss/package.json') {
            throw new Error('unable to locate tailwind css package')
          }
          return undefined
        }),
      }
    })
    const { createTailwindcssRuntime } = await loadRuntimeFactory()

    expect(() => createTailwindcssRuntime({
      tailwindcss: {
        packageName: 'tailwindcss',
        postcssPlugin: 'tailwindcss',
        resolve: {
          paths: ['/missing/node_modules'],
        },
      },
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          packageName: 'tailwindcss',
          postcssPlugin: 'tailwindcss',
        },
      },
    })).toThrow('unable to locate tailwind css package')

    expect(loggerError).toHaveBeenCalledWith(
      '无法定位 Tailwind CSS 包 "%s"，已尝试路径: %O',
      'tailwindcss',
      expect.arrayContaining(['/missing/node_modules']),
    )
  })
})

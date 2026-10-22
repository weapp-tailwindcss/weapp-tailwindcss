import { afterEach, describe, expect, it, vi } from 'vitest'

describe('生成期间的后续失效不得被提交覆盖', () => {
  afterEach(() => {
    vi.doUnmock('@/generator')
    vi.resetModules()
  })

  it.each(['candidate', 'dependency'] as const)('保留 %s 的新 epoch，并拒绝旧输出复用', async (kind) => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const source = { base: '/repo', baseFallbacks: [], css: '@tailwind utilities;', dependencies: [], projectRoot: '/repo' }
    const disposals: ReturnType<typeof vi.fn>[] = []
    const calls = vi.fn()
    vi.doMock('@/generator', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/generator')>(),
      createWeappTailwindcssGenerator: () => {
        const dispose = vi.fn()
        disposals.push(dispose)
        return {
          dispose,
          source,
          generate: async () => {
            calls()
            const round = calls.mock.calls.length
            if (round === 2) {
              await blocked
            }
            const classSet = new Set([`w-[${round}px]`])
            return {
              classSet,
              css: `width:${round}px`,
              dependencies: ['/repo/theme.ts'],
              rawCandidates: classSet,
              rawCss: `width:${round}px`,
              root: null,
              sources: [{ base: '/repo', pattern: '**/*', negated: false }],
              target: 'web',
            }
          },
          validateCandidates: vi.fn(),
        }
      },
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    const request = { id: 'root', source: source as any, scanSources: true, target: 'web' as const }
    const file = kind === 'candidate' ? '/repo/view.wxml' : '/repo/theme.ts'
    try {
      await compiler.generate(request)
      compiler.invalidate([file])
      const pending = compiler.generate(request)
      await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2))
      compiler.invalidate([file])
      release?.()
      await pending
      const latest = await compiler.generate(request)
      expect(latest.css).toBe('width:3px')
      expect(latest.cache.output).toBe(false)
      expect(latest.cache.engine).toBe(kind === 'candidate')
      expect(disposals).toHaveLength(kind === 'candidate' ? 1 : 3)
      expect(calls).toHaveBeenCalledTimes(3)
    }
    finally {
      release?.()
      await compiler.dispose()
    }
    for (const dispose of disposals) {
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  })
})

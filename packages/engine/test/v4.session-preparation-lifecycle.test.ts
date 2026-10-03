import type { TailwindGenerationSessionOptions } from '../src/v4/types'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTailwindV4EngineGenerationSession } from '../src/v4/generation-session'
import * as nodeAdapter from '../src/v4/node-adapter'

const source = { projectRoot: path.resolve(__dirname, '..'), base: path.resolve(__dirname, '..'), baseFallbacks: [], dependencies: [], css: '@import "tailwindcss";' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(() => vi.restoreAllMocks())

describe('generation source preparation lifecycle', () => {
  it.each(['designSystem', 'prepare', 'compile'] as const)('allows a successful retry after %s fails', async (stage) => {
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const compile = vi.spyOn(nodeAdapter, 'compileTailwindV4Source')
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>(actual => actual.css)
    const failure = new Error('retryable failure')
    if (stage === 'designSystem') {
      load.mockRejectedValueOnce(failure)
    }
    else if (stage === 'compile') {
      compile.mockRejectedValueOnce(failure)
    }
    else {
      prepareSource.mockRejectedValueOnce(failure)
    }
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    try {
      await expect(session.generate({ candidates: ['flex'] })).rejects.toThrow(failure)
      expect((await session.generate({ candidates: ['flex'] })).classSet).toEqual(new Set(['flex']))
      expect(load).toHaveBeenCalledTimes(stage === 'designSystem' ? 2 : 1)
      expect(compile).toHaveBeenCalledTimes(stage === 'compile' ? 2 : 1)
    }
    finally {
      session.dispose()
    }
  })

  it.each(['invalidate', 'dispose'] as const)('rejects a pending preparation after %s without compiling stale CSS', async (action) => {
    const entered = deferred<void>()
    const prepared = deferred<string>()
    const compile = vi.spyOn(nodeAdapter, 'compileTailwindV4Source')
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>(actual => actual.css)
      .mockImplementationOnce(() => {
        entered.resolve()
        return prepared.promise
      })
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    const stale = expect(session.generate({ candidates: ['flex'] })).rejects.toThrow(action === 'dispose' ? 'disposed' : 'changed during generation')
    await entered.promise
    try {
      if (action === 'dispose') {
        session.dispose()
      }
      else {
        session.invalidate({ type: 'source', source: { ...source, css: `${source.css} @utility current { display: block; }` } })
        expect((await session.generate({ candidates: ['current'] })).classSet).toEqual(new Set(['current']))
      }
      prepared.resolve(source.css)
      await stale
      expect(compile).toHaveBeenCalledTimes(action === 'dispose' ? 0 : 1)
      if (action === 'invalidate') {
        expect((await session.generate({ candidates: ['current'] })).classSet).toEqual(new Set(['current']))
        expect(prepareSource).toHaveBeenCalledTimes(2)
      }
      else {
        await expect(session.generate()).rejects.toThrow('disposed')
      }
    }
    finally {
      prepared.resolve(source.css)
      session.dispose()
    }
  })

  it('does not let a rejected previous revision evict the current design system or runtime', async () => {
    const pending = deferred<Awaited<ReturnType<typeof nodeAdapter.loadTailwindV4DesignSystem>>>()
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem').mockReturnValueOnce(pending.promise)
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>(actual => actual.css)
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    const stale = expect(session.generate({ candidates: ['flex'] })).rejects.toThrow('old load failed')
    try {
      session.invalidate({ type: 'dependencies', paths: [] })
      await session.generate({ candidates: ['flex'] })
      pending.reject(new Error('old load failed'))
      await stale
      await session.generate({ candidates: ['flex'] })
      await session.loadDesignSystem()
      expect(load).toHaveBeenCalledTimes(2)
      expect(prepareSource).toHaveBeenCalledTimes(1)
    }
    finally {
      pending.reject(new Error('old load failed'))
      session.dispose()
    }
  })
})

import type { TailwindGenerationSession } from '@weapp-tailwindcss/engine'
import { describe, expect, it, vi } from 'vitest'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'

const source = {
  projectRoot: '/workspace',
  base: '/workspace',
  baseFallbacks: [],
  css: '@import "tailwindcss";',
  dependencies: [],
}

function createSession() {
  return {
    source,
    generate: vi.fn(async () => ({
      fragments: [],
      classSet: new Set<string>(),
      rawCandidates: new Set<string>(),
      dependencies: [],
      sourceEntries: [],
    })),
    invalidate: vi.fn(),
    dispose: vi.fn(),
  } satisfies TailwindGenerationSession
}

describe('TailwindV4NativeSessionPool', () => {
  it('reuses a native session for the same target and source revision', async () => {
    const session = createSession()
    const create = vi.fn(() => session)
    const pool = new TailwindV4NativeSessionPool(create)

    await pool.generate('web', 'revision-1', source, { candidates: ['p-4'] })
    await pool.generate('web', 'revision-1', source, { candidates: ['p-4', 'm-2'] })

    expect(create).toHaveBeenCalledTimes(1)
    expect(session.generate).toHaveBeenCalledTimes(2)
  })

  it('disposes stale target sessions when the source revision changes', async () => {
    const first = createSession()
    const second = createSession()
    const create = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const pool = new TailwindV4NativeSessionPool(create)

    await pool.generate('weapp', 'revision-1', source, {})
    await pool.generate('weapp', 'revision-2', { ...source, css: '@import "tailwindcss/utilities";' }, {})

    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(2)
    pool.dispose()
    await Promise.resolve()
    expect(second.dispose).toHaveBeenCalledTimes(1)
  })

  it('serializes requests that share the same native session', async () => {
    let releaseFirst: (() => void) | undefined
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const session = createSession()
    session.generate
      .mockImplementationOnce(async () => {
        await firstPending
        return {
          fragments: [],
          classSet: new Set<string>(),
          rawCandidates: new Set<string>(),
          dependencies: [],
          sourceEntries: [],
        }
      })
      .mockImplementationOnce(async () => ({
        fragments: [],
        classSet: new Set<string>(),
        rawCandidates: new Set<string>(),
        dependencies: [],
        sourceEntries: [],
      }))
    const pool = new TailwindV4NativeSessionPool(() => session)

    const first = pool.generate('web', 'revision-1', source, { candidates: ['p-4'] })
    const second = pool.generate('web', 'revision-1', source, { candidates: ['m-2'] })
    await Promise.resolve()
    expect(session.generate).toHaveBeenCalledTimes(1)

    releaseFirst?.()
    await Promise.all([first, second])
    expect(session.generate).toHaveBeenCalledTimes(2)
  })

  it('replaces a session when preparation configuration changes and keeps targets isolated', async () => {
    const sessions = [createSession(), createSession(), createSession(), createSession()]
    const create = vi.fn()
    for (const session of sessions) {
      create.mockReturnValueOnce(session)
    }
    const pool = new TailwindV4NativeSessionPool(create)
    const prepareSource = vi.fn(actual => actual.css)
    try {
      await pool.generate('web', 'source', source, {}, { key: 'option-1', prepareSource })
      await pool.generate('web', 'source', source, {}, { key: 'option-1', prepareSource })
      await pool.generate('weapp', 'source', source, {}, { key: 'option-1', prepareSource })
      expect(create).toHaveBeenCalledTimes(2)
      expect(sessions[0]!.dispose).not.toHaveBeenCalled()
      await pool.generate('web', 'source', source, {}, { key: 'option-2', prepareSource })
      expect(sessions[0]!.dispose).toHaveBeenCalledTimes(1)
      expect(sessions[1]!.dispose).not.toHaveBeenCalled()
      expect(create).toHaveBeenNthCalledWith(3, source, { key: 'option-2', prepareSource })
      await pool.generate('web', 'source', source, {})
      expect(sessions[2]!.dispose).toHaveBeenCalledTimes(1)
      expect(create).toHaveBeenCalledTimes(4)
    }
    finally {
      pool.dispose()
    }
  })
})

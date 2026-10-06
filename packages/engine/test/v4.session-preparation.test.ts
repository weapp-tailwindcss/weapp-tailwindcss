import type { TailwindGenerationSessionOptions, TailwindV4DesignSystem } from '../src/v4/types'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTailwindV4EngineGenerationSession } from '../src/v4/generation-session'
import * as nodeAdapter from '../src/v4/node-adapter'
import { resolveTailwindV4Source } from '../src/v4/source'

async function createSource(css = '@import "tailwindcss";') {
  return resolveTailwindV4Source({ projectRoot: path.resolve(__dirname, '..'), base: path.resolve(__dirname, '..'), css })
}

afterEach(() => vi.restoreAllMocks())

describe('generation session source preparation', () => {
  it.each([false, true])('shares the exact source design system between validation and generation (generateFirst=%s)', async (generateFirst) => {
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const session = createTailwindV4EngineGenerationSession(await createSource())
    try {
      if (generateFirst) {
        await session.generate({ candidates: ['flex'] })
      }
      const designSystem = await session.loadDesignSystem()
      expect(designSystem.getClassOrder?.(['flex'])).toEqual([['flex', 0n]])
      await session.generate({ candidates: ['flex'] })
      expect(load).toHaveBeenCalledTimes(1)
    }
    finally {
      session.dispose()
    }
  })

  it('preserves metadata and reuses prepared CSS and ordering when candidates are removed', async () => {
    const source = await createSource('@import "tailwindcss"; /* generated-marker */')
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const compile = vi.spyOn(nodeAdapter, 'compileTailwindV4Source')
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>((actualSource, designSystem) => {
      expect(designSystem.getClassOrder?.(['text-red-500', 'flex'])).toEqual([['text-red-500', 1n], ['flex', 0n]])
      return actualSource.css.replace('/* generated-marker */', '')
    })
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    try {
      const first = await session.generate({ candidates: ['flex', 'text-red-500'] })
      await session.generate({ candidates: ['flex', 'text-red-500', 'block'] })
      const removed = await session.generate({ candidates: ['flex'] })
      expect(first.classSet).toEqual(new Set(['flex', 'text-red-500']))
      expect(removed.fragments[0]?.root.toString()).not.toContain('.text-red-500')
      expect(removed.fragments[0]?.root.toString()).not.toContain('generated-marker')
      expect(removed.classSet).toEqual(new Set(['flex']))
      expect(prepareSource).toHaveBeenCalledTimes(1)
      expect(load).toHaveBeenCalledTimes(1)
      expect(compile).toHaveBeenCalledTimes(2)
      expect(compile.mock.calls[0]![0]).toEqual({ ...source, css: source.css.replace('/* generated-marker */', '') })
      expect(compile.mock.calls[1]![0]).toBe(compile.mock.calls[0]![0])
      expect(session.source).toBe(source)
      expect(first.fragments[0]?.sourceId).toBe(source.base)
    }
    finally {
      session.dispose()
    }
  })

  it('refreshes ordering and candidate validity after the source changes', async () => {
    const css = '@import "tailwindcss"; @utility custom { color: red; }'
    const systems: TailwindV4DesignSystem[] = []
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>((source, system) => {
      systems.push(system)
      return source.css
    })
    const session = createTailwindV4EngineGenerationSession(await createSource(css), { prepareSource })
    try {
      const first = await session.generate({ candidates: ['custom', 'next-custom'] })
      session.invalidate({ type: 'source', source: await createSource(css.replace('custom', 'next-custom').replace('color: red', 'display: block')) })
      const second = await session.generate({ candidates: ['custom', 'next-custom'] })
      expect(first.classSet).toEqual(new Set(['custom']))
      expect(second.classSet).toEqual(new Set(['next-custom']))
      expect(systems[0]).not.toBe(systems[1])
      expect(systems[0]?.getClassOrder?.(['custom', 'p-4'])).toEqual([['custom', 1n], ['p-4', 0n]])
      expect(systems[1]?.getClassOrder?.(['next-custom', 'p-4'])).toEqual([['next-custom', 0n], ['p-4', 1n]])
    }
    finally {
      session.dispose()
    }
  })

  it('prepares each actual scan source once and only shares exact matching CSS', async () => {
    const source = await createSource('@import "tailwindcss" source(none); @source inline("flex");')
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const compile = vi.spyOn(nodeAdapter, 'compileTailwindV4Source')
    const prepareSource = vi.fn<NonNullable<TailwindGenerationSessionOptions['prepareSource']>>(actual => actual.css)
    const session = createTailwindV4EngineGenerationSession(source, { prepareSource })
    try {
      for (const scanSources of [false, true, false]) {
        expect((await session.generate({ scanSources, candidates: ['block'] })).classSet).toEqual(new Set(['block', 'flex']))
      }
      const originalSystem = await session.loadDesignSystem()
      expect(prepareSource).toHaveBeenCalledTimes(2)
      expect(compile).toHaveBeenCalledTimes(2)
      expect(load).toHaveBeenCalledTimes(2)
      expect(prepareSource.mock.calls[0]![0].css).not.toContain('@source')
      expect(prepareSource.mock.calls[0]![0].css).not.toContain('source(none)')
      expect(prepareSource.mock.calls[1]![0]).toBe(source)
      expect(prepareSource.mock.calls[1]![1]).toBe(originalSystem)
      expect(prepareSource.mock.calls[0]![1]).not.toBe(originalSystem)
      expect(compile.mock.calls.map(([actual]) => actual.css)).toEqual(prepareSource.mock.calls.map(([actual]) => actual.css))
    }
    finally {
      session.dispose()
    }
  })
})

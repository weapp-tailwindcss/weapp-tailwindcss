import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTailwindV4Source } from '@/generator'
import { createLocalUtilitySourcePreparation } from '@/tailwindcss/v4-engine/generator/local-utility-order'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'
import { generateRawArtifact } from '@/tailwindcss/v4-engine/generator/raw-generation'
import * as nodeAdapter from '../../../engine/src/v4/node-adapter'

vi.mock('@weapp-tailwindcss/engine', () => import('../../../engine/src/index'))

const css = '@import "tailwindcss" source(none); /*! weapp-tailwindcss local-utility */ .local-rgb{@apply bg-[rgb(12,34,56)];} /*! weapp-tailwindcss local-utility */ .local-hex{@apply bg-[#000002];}'

afterEach(() => vi.restoreAllMocks())

describe('local ordering shares the generation session design system', () => {
  it.each(['weapp', 'web'] as const)('loads one design system for ordering, compilation and validation (%s)', async (target) => {
    const source = await resolveTailwindV4Source({ base: process.cwd(), css })
    const load = vi.spyOn(nodeAdapter, 'loadTailwindV4DesignSystem')
    const compile = vi.spyOn(nodeAdapter, 'compileTailwindV4Source')
    const pool = new TailwindV4NativeSessionPool()
    try {
      const generated = await generateRawArtifact(pool, source, { target, candidates: ['flex'], scanSources: false })
      expect(generated.rawCss.indexOf('.local-hex')).toBeLessThan(generated.rawCss.indexOf('.local-rgb'))
      expect(generated.rawCss).not.toContain('weapp-tailwindcss local-utility')
      expect(generated.classSet).toEqual(new Set(['flex']))
      expect(compile).toHaveBeenCalledTimes(1)
      expect(load).toHaveBeenCalledTimes(1)
      await generateRawArtifact(pool, source, { target, candidates: ['flex', 'block'], scanSources: false })
      const removed = await generateRawArtifact(pool, source, { target, candidates: ['flex'], scanSources: false })
      expect(removed.rawCss).not.toContain('.block')
      expect(removed.rawCss.indexOf('.local-hex')).toBeLessThan(removed.rawCss.indexOf('.local-rgb'))
      expect(removed.rawCss).not.toContain('weapp-tailwindcss local-utility')
      expect(load).toHaveBeenCalledTimes(1)
      expect(compile).toHaveBeenCalledTimes(2)
    }
    finally {
      pool.dispose()
    }
  })

  it('tracks target normalization options in the preparation identity and snapshots mutable options', async () => {
    const source = await resolveTailwindV4Source({ base: process.cwd(), css: '@import "tailwindcss"; /*! weapp-tailwindcss local-utility */ .rpx{@apply text-[23rpx];} /*! weapp-tailwindcss local-utility */ .bare{@apply p-10%;}' })
    const bare = { units: ['%'] }
    const options = { appType: 'uni-app-x' }
    const preparation = createLocalUtilitySourcePreparation(source, 'web', options, bare)!
    const getClassOrder = vi.fn((candidates: string[]): Array<[string, bigint | null]> => candidates.map((candidate, index) => [candidate, BigInt(index)]))
    const system = { getClassOrder, parseCandidate: () => [], candidatesToCss: () => [] }
    bare.units[0] = 'px'
    options.appType = 'other'
    preparation.prepareSource!(source, system)
    expect(getClassOrder).toHaveBeenCalledExactlyOnceWith(['text-[length:23rpx]', 'p-[10%]'])
    expect(preparation.key).toBe(createLocalUtilitySourcePreparation(source, 'web', { appType: 'uni-app-x' }, { units: ['%'] })?.key)
    expect(preparation.key).not.toBe(createLocalUtilitySourcePreparation(source, 'web', options, bare)?.key)
    expect(preparation.key).not.toBe(createLocalUtilitySourcePreparation(source, 'weapp', { appType: 'uni-app-x' }, { units: ['%'] })?.key)
    expect(preparation.key).not.toBe(createLocalUtilitySourcePreparation(source, 'web', { appType: 'uni-app-x' }, false)?.key)
  })
})

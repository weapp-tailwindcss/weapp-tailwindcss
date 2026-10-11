import type { CacheSource } from '../src/cache/source'
import type { sources } from 'webpack'
import { expect, it } from 'vitest'
import { sources as webpackSources } from 'webpack'

it('独立缓存协议兼容 Webpack Source', () => {
  const toCore = (source: sources.Source): CacheSource => source
  const toWebpack = (source: CacheSource): sources.Source => source
  const source = new webpackSources.RawSource('flex')
  expect(toWebpack(toCore(source))).toBe(source)
})

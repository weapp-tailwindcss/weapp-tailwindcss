import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCases, pickCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { resolveWatchCommandTimeoutMs } from './watch/hot-update/command-budget'

const cases = buildCases(path.resolve(import.meta.dirname, '..'))
const webpack = pickCases(cases, 'taro-webpack-vue3-tailwindcss-v4')
const timeoutMs = 240_000

describe('watch command budget', () => {
  it('reserves separate budgets for the main package, both subpackages and Web', () => {
    expect(webpack).toHaveLength(1)
    expect(webpack[0]!.subPackageMutations).toHaveLength(2)
    expect(webpack[0]!.webHmr).toBeDefined()
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs)).toBe(4 * timeoutMs + 180_000)
  })

  it('only budgets the selected surfaces in reduced profiles', () => {
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs, { miniProgramOnly: true })).toBe(3 * timeoutMs + 180_000)
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs, { miniProgramScope: 'main-package', miniProgramOnly: true })).toBe(timeoutMs + 180_000)
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs, { miniProgramScope: 'subpackages' })).toBe(2 * timeoutMs + 180_000)
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs, { webOnly: true })).toBe(timeoutMs + 180_000)
    expect(resolveWatchCommandTimeoutMs(webpack, timeoutMs, { mainStyleOnly: true, mainStyleSubPackageLimit: 1 })).toBe(2 * timeoutMs + 180_000)
  })

  it('adds selected cases while paying command startup overhead once', () => {
    const duplicated = [...webpack, ...webpack]
    expect(resolveWatchCommandTimeoutMs(duplicated, timeoutMs)).toBe(2 * resolveWatchCommandTimeoutMs(webpack, timeoutMs) - 180_000)
  })
})

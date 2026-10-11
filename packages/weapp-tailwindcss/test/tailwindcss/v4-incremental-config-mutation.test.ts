import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { afterEach, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(fn => fn()))
  clearTailwindV4IncrementalGenerateCacheForTest()
})
const theme = '@theme { --spacing: 1rpx; } @tailwind utilities;'
const runtimeWidth = /width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/

it.each(['web', 'weapp'] as const)('非空间初始候选后新增主题依赖 %s', async (target) => {
  const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
  const engine = createTailwindV4Engine(source)
  cleanup.push(() => engine.dispose?.())
  const request = { target, scanSources: false, incrementalCache: true, styleOptions: { cssCalc: ['--spacing'] } }
  await engine.generate({ ...request, candidates: ['block'] })
  const result = await engine.generate({ ...request, candidates: ['block', 'w-32'] })
  expect(result.css).toMatch(/width:\s*32rpx/)
  expect(result.rawCss).toMatch(/--spacing:\s*1rpx/)
})

for (const target of ['web', 'weapp'] as const) {
  for (const nested of [false, true]) {
    for (const compilerMode of [false, true]) {
      it(`原地 Map/RegExp 与删除重加：${target} nested=${nested} compiler=${compilerMode}`, async () => {
        const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
        const engine = createTailwindV4Engine(source)
        const compiler = createCompiler()
        cleanup.push(() => engine.dispose?.(), () => compiler.dispose())
        const values = new Map([['--spacing', '1rpx']])
        const compatibility = new Map([['--spacing', '20rpx']])
        const pattern = /^--spacing$/g
        const cssCalc = { includeCustomProperties: [pattern], customPropertyValues: values }
        const styleOptions: Partial<IStyleHandlerOptions> = {
          ...(nested ? { cssOptions: { cssCalc } } : { cssCalc }),
          customPropertyCompatibilityValues: compatibility,
        }
        const generate = (candidates = ['w-32']) => {
          const request = { candidates, target, scanSources: false, incrementalCache: true, styleOptions }
          return compilerMode ? compiler.generate({ ...request, id: 'audit-root', source }) : engine.generate(request)
        }
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
        expect((await generate()).incrementalCss).toBe('')
        values.set('--spacing', '2rpx')
        expect((await generate()).css).toMatch(/width:\s*64rpx/)
        values.clear()
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
        values.set('--spacing', '3rpx')
        expect((await generate()).css).toMatch(/width:\s*96rpx/)
        compatibility.set('--spacing', '80rpx')
        expect((await generate()).css).toMatch(/width:\s*96rpx/)
        values.delete('--spacing')
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
        pattern.compile('^--unselected$', 'i')
        expect((await generate()).css).toMatch(runtimeWidth)
        pattern.compile('^--SPACING$', 'gi')
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
        pattern.lastIndex = 42
        expect((await generate()).incrementalCss).toBe('')
        const dynamicCandidates = ['w-32', '[--spacing:2rpx]']
        expect((await generate(dynamicCandidates)).css).toMatch(runtimeWidth)
        expect((await generate(dynamicCandidates)).incrementalCss).toBe('')
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
        expect((await generate(dynamicCandidates)).css).toMatch(runtimeWidth)
        expect((await generate([])).css).not.toMatch(/width:/)
        expect((await generate()).css).toMatch(/width:\s*32rpx/)
      })
    }
  }
}

it.each([false, true])('显式候选来源原地清空及重加 compiler=%s', async (compilerMode) => {
  const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
  const engine = createTailwindV4Engine(source)
  const compiler = createCompiler()
  cleanup.push(() => engine.dispose?.(), () => compiler.dispose())
  const sources = [{ content: '<view class="w-32"></view>', extension: 'html' }]
  const generate = () => {
    const request = { candidates: [], sources, target: 'weapp' as const, scanSources: false, incrementalCache: true, styleOptions: { cssCalc: ['--spacing'] } }
    return compilerMode ? compiler.generate({ ...request, id: 'audit-sources', source }) : engine.generate(request)
  }
  expect((await generate()).css).toMatch(/width:\s*32rpx/)
  sources[0]!.content = '<view class="p-4"></view>'
  const changed = await generate()
  expect(changed.css).toMatch(/padding:\s*4rpx/)
  expect(changed.css).not.toMatch(/width:/)
  sources.splice(0)
  expect((await generate()).css).not.toMatch(/padding:|width:/)
  sources.push({ content: '<view class="w-32"></view>', extension: 'html' })
  expect((await generate()).css).toMatch(/width:\s*32rpx/)
})

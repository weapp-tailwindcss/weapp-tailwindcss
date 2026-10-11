import type { Compiler } from '@/core/compiler'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

describe('compiler calc configuration cache', () => {
  const compilers: Compiler[] = []

  afterEach(async () => {
    await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()))
  })

  async function createCase() {
    const compiler = createCompiler()
    compilers.push(compiler)
    const source = await resolveTailwindV4Source({
      css: '@theme { --spacing: 1rpx; } @tailwind utilities;',
      base: process.cwd(),
    })
    return {
      compiler,
      request: { id: 'calc-root', source, candidates: ['w-32'], scanSources: false, target: 'web' as const },
    }
  }

  it('reuses equivalent maps and regenerates when a mapped value changes in place', async () => {
    const { compiler, request } = await createCase()
    const values = new Map([['--spacing', '1rpx'], ['--unused', '2rpx']])
    const generate = (customPropertyValues: Map<string, string>) => compiler.generate({
      ...request,
      styleOptions: { cssCalc: ['--spacing'], customPropertyValues },
    })
    const first = await generate(values)
    const equivalent = await generate(new Map([...values].reverse()))
    expect(first.css).toMatch(/width:\s*32rpx/)
    expect(equivalent.css).toBe(first.css)
    expect(equivalent.cache.output).toBe(true)

    values.set('--spacing', '2rpx')
    const changed = await generate(values)
    expect(changed.cache.output).toBe(false)
    expect(changed.css).toMatch(/width:\s*64rpx/)
    expect(changed.css).not.toMatch(/width:\s*32rpx/)
  })

  it('distinguishes regex source and flags at the compiler cache boundary', async () => {
    const { compiler, request } = await createCase()
    const generate = (pattern: RegExp) => compiler.generate({
      ...request,
      styleOptions: { cssCalc: [pattern] },
    })
    const first = await generate(/^--spacing$/g)
    const equivalentPattern = /^--spacing$/g
    equivalentPattern.lastIndex = 4
    const equivalent = await generate(equivalentPattern)
    expect(first.css).toMatch(/width:\s*32rpx/)
    expect(equivalent.cache.output).toBe(true)

    const unmatched = await generate(/^--SPACING$/)
    expect(unmatched.cache.output).toBe(false)
    expect(unmatched.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)

    const insensitive = await generate(/^--SPACING$/i)
    expect(insensitive.cache.output).toBe(false)
    expect(insensitive.css).toMatch(/width:\s*32rpx/)
  })
})

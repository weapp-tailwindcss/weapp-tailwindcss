import process from 'node:process'
import { it } from 'vitest'
import { createAuthorCssFunctionCompiler } from '@/generation/user-css/compile-functions'
import { TailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'

it('compiles author functions in 1000 CSS rules', async ({ bench }) => {
  const session = new TailwindGenerationSessionPool()
  try {
    const compile = createAuthorCssFunctionCompiler([{
      css: '@import "tailwindcss";@theme{--spacing:2px}',
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      dependencies: [],
    }], session)
    const generated = '.p-3{padding:calc(var(--spacing) * 3)}'.repeat(1000)
    const literal = '.label{content:"--spacing(3)"}'.repeat(1000)
    const author = '.custom{padding:--spacing(3)}'.repeat(1000)
    // 先填充当前编译上下文的值缓存，单独观测重复处理成本。
    await compile(author)
    await bench('generated CSS without compiler functions', () => compile(generated)).run()
    await bench('literal function text', () => compile(literal)).run()
    await bench('author functions with cached values', () => compile(author)).run()
  }
  finally {
    session.dispose()
  }
})

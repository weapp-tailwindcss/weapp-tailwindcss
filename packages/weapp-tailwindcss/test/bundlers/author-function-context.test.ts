import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { createAuthorCssFunctionCompiler } from '@/generation/user-css/compile-functions'
import { TailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'

function source(color: string) {
  return {
    css: `@import "tailwindcss";@theme{--color-brand:${color}}`,
    projectRoot: process.cwd(),
    base: process.cwd(),
    baseFallbacks: [],
    dependencies: [],
  }
}

describe('author function compiler context', () => {
  it('uses the current source theme and refreshes it after edits', async () => {
    const session = new TailwindGenerationSessionPool()
    try {
      for (const color of ['#123456', '#abcdef']) {
        const compile = createAuthorCssFunctionCompiler([source(color)], session)
        const css = await compile(`.x{color:red}.x{color:theme('colors.brand');padding:theme('spacing.2')}`)
        expect(css).toContain(`color:${color}`)
        expect(css).toContain('padding:0.5rem')
        expect(css).not.toContain('theme(')
        expect(await compile(`.y{color:theme('colors.brand')}`)).toContain(`color:${color}`)
      }
    }
    finally {
      session.dispose()
    }
  })

  it('refuses ambiguous themes instead of selecting the first source', async () => {
    const session = new TailwindGenerationSessionPool()
    try {
      const compile = createAuthorCssFunctionCompiler([source('red'), source('blue')], session)
      await expect(compile(`.x{color:theme('colors.brand')}`)).rejects.toThrow('多个不同')
    }
    finally {
      session.dispose()
    }
  })

  it('does not compile generated utility CSS without author functions', async () => {
    const session = new TailwindGenerationSessionPool()
    const generate = vi.spyOn(session, 'generate')
    try {
      const compile = createAuthorCssFunctionCompiler([source('#123456')], session)
      const generatedCss = `/*! weapp-tailwindcss vite-generated-css:app.wxss */.a{padding:calc(var(--spacing) * 1)}`.repeat(200)
      await expect(compile(generatedCss)).resolves.toBe(generatedCss)
      expect(generate).not.toHaveBeenCalled()
    }
    finally {
      session.dispose()
    }
  })
})

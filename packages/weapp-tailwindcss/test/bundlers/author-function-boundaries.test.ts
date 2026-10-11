import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { createAuthorCssFunctionCompiler } from '@/generation/user-css/compile-functions'
import { TailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'

const source = {
  css: '@import "tailwindcss";@theme{--spacing:2px;--color-brand:#123456}',
  projectRoot: process.cwd(),
  base: process.cwd(),
  baseFallbacks: [],
  dependencies: [],
}

describe('author function compilation boundaries', () => {
  it.each([
    ['large author stylesheet', '.unrelated{color:red}'.repeat(500)],
    ['tool name in content', '.label{content:"weapp-tailwindcss"}'],
    ['version text in content', '.label{content:"tailwindcss v4"}'],
    ['generated marker with unresolved author value', '/*! weapp-tailwindcss vite-generated-css:entry.css */'],
  ])('compiles spacing regardless of %s', async (_, prefix) => {
    const session = new TailwindGenerationSessionPool()
    try {
      const compile = createAuthorCssFunctionCompiler([source], session)
      const result = await compile(`${prefix}.probe{padding:--spacing(3)}`)
      expect(result).toContain(prefix)
      expect(result).toContain('.probe{padding:calc(var(--spacing) * 3)}')
      expect(result).not.toContain('padding:--spacing(')
    }
    finally {
      session.dispose()
    }
  })

  it('compiles repeated alpha values in large CSS once per source context', async () => {
    const session = new TailwindGenerationSessionPool()
    const generate = vi.spyOn(session, 'generate')
    try {
      const compile = createAuthorCssFunctionCompiler([source], session)
      const css = '.probe{color:--alpha(var(--color-brand) / 25%)}'.repeat(500)
      const result = await compile(css)
      expect(result).not.toContain('--alpha(')
      expect(result.match(/color:color-mix\(/g)).toHaveLength(500)
      expect(generate).toHaveBeenCalledOnce()
      expect(await compile('.other{color:--alpha(var(--color-brand) / 25%)}')).toContain('color:color-mix(')
      expect(generate).toHaveBeenCalledOnce()
    }
    finally {
      session.dispose()
    }
  })

  it('does not invoke Tailwind for generated CSS with only literal function text', async () => {
    const session = new TailwindGenerationSessionPool()
    const generate = vi.spyOn(session, 'generate')
    try {
      const compile = createAuthorCssFunctionCompiler([source], session)
      const css = '/*! weapp-tailwindcss vite-generated-css:entry.css */.label{content:"--spacing(3)"}.p-3{padding:calc(var(--spacing) * 3)}'
      expect(await compile(css)).toBe(css)
      expect(generate).not.toHaveBeenCalled()
    }
    finally {
      session.dispose()
    }
  })
})

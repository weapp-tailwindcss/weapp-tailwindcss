import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'

const banner = '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */'
const vendor = '/*! Vendor styles | MIT */'
const source = `${banner}\n${vendor}\n.card{display:flex;content:"/*! tailwindcss v4.3.3 */"}`

describe('core compiler banner finalization', () => {
  it.each([
    ['weapp', undefined, false],
    ['weapp', true, false],
    ['weapp', false, true],
    ['web', undefined, true],
    ['web', true, true],
    ['tailwind', undefined, true],
    ['tailwind', true, true],
  ] as const)('preserves target and explicit finalization semantics (%s, %s)', async (target, finalize, keepBanner) => {
    const compiler = createCompiler({ cssPreflight: false })
    try {
      const snapshot = compiler.createSnapshot({ id: `banner:${target}`, target, classSet: [] })
      const options = finalize === undefined ? undefined : { finalize }
      const input = postcss.parse(source)
      const results = [
        await compiler.transformCss(source, snapshot, options),
        await compiler.transformCssRoot(input, snapshot, options),
      ]
      for (const result of results) {
        const comments: string[] = []
        result.root.walkComments((comment) => {
          comments.push(comment.text)
        })
        expect(comments.some(text => text.startsWith('! tailwindcss v'))).toBe(keepBanner)
        expect(result.css).toContain(vendor)
        expect(result.css).toContain('content:"/*! tailwindcss v4.3.3 */"')
        expect(result.css).toContain('display:flex')
      }
      expect(input.toString()).toBe(source)
    }
    finally {
      await compiler.dispose()
    }
  })
})

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectTailwindStyleCandidates, generateTailwindV4Style, resolveTailwindV4Source } from '../src/index'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('v4 style generator', () => {
  it('collects explicit, template and apply candidates including bare arbitrary values', async () => {
    const tokens = await collectTailwindStyleCandidates({
      bareArbitraryValues: true,
      candidates: ['text-red-500'],
      sources: [
        { content: '<view class="min-h-screen rounded-[18px] p-10%" />', extension: 'wxml' },
        { content: '.primary { @apply inline-flex items-center; }', extension: 'css' },
      ],
    })
    expect(tokens).toEqual(new Set(['text-red-500', 'min-h-screen', 'rounded-[18px]', 'p-10%', 'inline-flex', 'items-center']))
  })

  it.each([false, true])('generates v4 CSS with a pre-resolved source: %s', async (resolved) => {
    const options = { projectRoot, css: '@import "tailwindcss";' }
    const result = await generateTailwindV4Style({
      ...(resolved ? { source: await resolveTailwindV4Source(options) } : options),
      candidates: ['flex', 'invalid-utility'],
      sources: [{ content: '<view class="p-10%" />', extension: 'wxml' }],
      bareArbitraryValues: true,
    })
    expect(result.tokens).toEqual(new Set(['flex', 'invalid-utility', 'p-10%']))
    expect(result.classSet).toEqual(new Set(['flex', 'p-10%']))
    expect(result.css).toContain('display: flex')
    expect(result.css).toContain('padding: 10%')
    expect(result.source.projectRoot).toBe(projectRoot)
  })
})

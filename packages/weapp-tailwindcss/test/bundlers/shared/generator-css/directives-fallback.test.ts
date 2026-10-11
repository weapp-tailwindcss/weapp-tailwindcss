import { describe, expect, it } from 'vitest'
import {
  extractConfigRequestFromSource,
  extractTailwindDirectiveLines,
  extractTailwindSourceForPostcssFallback,
} from '@/generation/directives/fallback'

describe('generator css directive fallback extraction', () => {
  it('normalizes extractable directives and filters unrelated imports', () => {
    const source = [
      '// @import "tailwindcss";',
      '@use "tailwindcss";',
      '@forward "tailwindcss4/utilities";',
      '@import "weapp-tailwindcss";',
      '@import "#tailwind";',
      '@import "./local.css";',
      '@import ;',
      '@config "./tailwind.config.ts";',
      '@source "./src";',
      '@layer components;',
      '@layer utilities { .skip{} }',
    ].join('\n')

    expect(extractTailwindDirectiveLines(source, { importFallback: true })).toEqual([
      '@import "tailwindcss";',
      '@import "tailwindcss4/utilities";',
      '@import "#tailwind";',
      '@config "./tailwind.config.ts";',
      '@source "./src";',
      '@layer components;',
    ])
    expect(extractTailwindDirectiveLines(source, { importFallback: true, removeConfig: true }))
      .not.toContain('@config "./tailwind.config.ts";')
    expect(extractTailwindDirectiveLines([
      '@use "weapp-tailwindcss/theme";',
      '@forward "local-lib";',
      '@import url("tailwindcss");',
      '@import url("local.css");',
      '@source "./src" @theme{--a:1}',
      '@import ;',
    ].join('\n'), { importFallback: true })).toEqual([
      '@import "tailwindcss/theme";',
      '@import url("tailwindcss");',
      '@source "./src" @theme{--a:1}',
    ])
  })

  it('extracts balanced fallback blocks while respecting quotes and comments', () => {
    const extracted = extractTailwindSourceForPostcssFallback([
      '@theme {',
      '  --content: "{not-a-block}"; // keep braces inside quotes',
      '}',
      '@utility btn { color: red; } // closes immediately',
      '@variant hocus {',
      '  &:hover { color: blue; }',
      '}',
      '.plain { color: black; }',
    ].join('\n'))

    expect(extracted).toContain('@theme')
    expect(extracted).toContain('--content: "{not-a-block}";')
    expect(extracted).toContain('@utility btn { color: red; }')
    expect(extracted).toContain('@variant hocus')
    expect(extracted).not.toContain('.plain')
    expect(extractTailwindSourceForPostcssFallback('.plain{}')).toBeUndefined()
  })

  it('resolves config requests only from quoted config directives', () => {
    expect(extractConfigRequestFromSource('@config "./tailwind.config.ts";')).toBe('./tailwind.config.ts')
    expect(extractConfigRequestFromSource('.plain{}\n@config "./tailwind.config.cjs";')).toBe('./tailwind.config.cjs')
    expect(extractConfigRequestFromSource('@config tailwind.config.ts;')).toBeUndefined()
  })
})

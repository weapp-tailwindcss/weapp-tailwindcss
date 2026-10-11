import { describe, expect, it } from 'vitest'
import { createTailwindV4ApplyReferenceSource } from '@/generation/source-resolver/apply-reference'

describe('generator css apply reference', () => {
  it('references the only configured Tailwind root for component apply rules', () => {
    const css = '.probe { @apply bg-issue-1021-hmr; }'
    const result = createTailwindV4ApplyReferenceSource(css, {
      cssSources: [
        {
          css: '@import "tailwindcss";\n@theme { --color-issue-1021-hmr: #3b0764; }',
          file: '/project/main.css',
        },
        {
          css,
          file: '/project/components/Probe.uvue?vue&type=style',
        },
      ],
    })

    expect(result).toContain('@reference "/project/main.css";')
    expect(result).toContain('@source inline("bg-issue-1021-hmr");')
    expect(result).not.toContain('@import "tailwindcss" source(none);')
  })

  it('references a Tailwind root whose project theme comes from @config', () => {
    const css = '.probe { @apply bg-primary; }'
    const result = createTailwindV4ApplyReferenceSource(css, {
      cssSources: [
        {
          css: '@import "tailwindcss" source(none);\n@config "./tailwind.config.js";',
          file: 'C:\\project\\main.css',
        },
        {
          css,
          file: 'C:\\project\\pages\\index\\index.uvue?vue&type=style',
        },
      ],
    })

    expect(result).toContain('@reference "C:/project/main.css";')
    expect(result).toContain('@source inline("bg-primary");')
    expect(result).not.toContain('@import "tailwindcss" source(none);')
  })

  it('falls back to the Tailwind package when configured roots are ambiguous', () => {
    const result = createTailwindV4ApplyReferenceSource('.probe { @apply flex; }', {
      cssSources: [
        { css: '@import "tailwindcss";\n@theme { --color-main: #123456; }', file: '/project/main.css' },
        { css: '@import "tailwindcss";\n@theme { --color-admin: #654321; }', file: '/project/admin.css' },
      ],
    })

    expect(result).toContain('@import "tailwindcss" source(none);')
    expect(result).not.toContain('@reference')
  })

  it('normalizes Windows Tailwind root paths in reference directives', () => {
    const result = createTailwindV4ApplyReferenceSource('.probe { @apply flex; }', {
      cssSources: [{
        css: '@import "tailwindcss";\n@theme { --color-probe: #123456; }',
        file: 'D:\\project\\main.css',
      }],
    })

    expect(result).toContain('@reference "D:/project/main.css";')
    expect(result).not.toContain('D:\\project')
  })

  it('keeps the package fallback for a root without project theme directives', () => {
    const result = createTailwindV4ApplyReferenceSource('.probe { @apply flex; }', {
      cssEntries: ['/project/main.css'],
      cssSources: [{
        css: '@import "tailwindcss";\n@plugin "@iconify/tailwind4";\n@source "../**/*.vue";',
        file: '/project/main.css',
      }],
    })

    expect(result).toContain('@import "tailwindcss" source(none);')
    expect(result).not.toContain('@reference')
  })

  it('does not inject a reference into an explicit Tailwind root source', () => {
    const css = '@import "tailwindcss";\n.probe { @apply flex; }'
    const result = createTailwindV4ApplyReferenceSource(css, {
      cssEntries: ['/project/main.css'],
    })

    expect(result).toBe(css)
  })
})

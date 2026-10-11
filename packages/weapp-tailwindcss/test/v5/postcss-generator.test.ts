import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import weappTailwindcss from '@/postcss'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'

const MINIMAL_THEME_CSS = `
@theme default {
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --spacing: 0.25rem;
}
@tailwind utilities;
`
const repositoryRoot = path.resolve(__dirname, '../../../..')

describe('v5 postcss generator', () => {
  it('generates mini-program css from tailwind v4 input by default', async () => {
    const result = await postcss([
      weappTailwindcss({
        candidates: ['hover:bg-blue-500', 'w-[100px]'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).toContain('width: 100px')
    expect(result.css).not.toContain(':hover')
    expect(result.css).not.toContain('@supports')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'weapp',
    }))
  })

  it('can generate web css from the same tailwind v4 input', async () => {
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        candidates: ['hover:bg-blue-500', 'w-[100px]'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.hover\\:bg-blue-500')
    expect(result.css).toContain('@media (hover: hover)')
    expect(result.css).toContain('.w-\\[100px\\]')
    expect(result.css).not.toContain('.w-_b100px_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'web',
    }))
  })

  it('keeps web target aligned with native Tailwind v4 defaults by default', async () => {
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        candidates: ['ring', 'border', 'shadow-sm'],
        scanSources: false,
      }),
    ]).process(`
      @theme default {
        --color-blue-500: #3b82f6;
        --color-gray-200: #e5e7eb;
        --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
      }
      @tailwind utilities;
    `, {
      from: undefined,
    })

    expect(result.css).not.toContain('border-color: var(--color-gray-200, currentcolor)')
    expect(result.css).toContain('calc(1px + var(--tw-ring-offset-width))')
    expect(result.css).toContain('--tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1))')
  })

  it('passes explicit Tailwind v4 opt-in through postcss generator options', async () => {
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        candidates: ['ring', 'border', 'shadow-sm'],
        scanSources: false,
      }),
    ]).process(`
      @theme default {
        --color-blue-500: #3b82f6;
        --color-gray-200: #e5e7eb;
        --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
      }
      @tailwind utilities;
    `, {
      from: undefined,
    })

    expect(result.css).not.toContain('border-color: var(--color-gray-200, currentcolor)')
    expect(result.css).toContain('calc(1px + var(--tw-ring-offset-width))')
    expect(result.css).toContain('--tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1))')
  })

  it('uses generator target option for v4 web output', async () => {
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        candidates: ['hover:bg-blue-500', 'w-[100px]'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.hover\\:bg-blue-500')
    expect(result.css).toContain('.w-\\[100px\\]')
    expect(result.css).not.toContain('.w-_b100px_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'web',
    }))
  })

  it('resolves @source paths relative to the current postcss input file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-'))
    const cssEntry = path.join(root, 'app.css')
    const sourceDir = path.join(root, 'src')
    const pageEntry = path.join(sourceDir, 'page.wxml')
    await mkdir(sourceDir)
    await writeFile(pageEntry, '<view class="w-[100px] bg-blue-500"></view>', 'utf8')

    const result = await postcss([
      weappTailwindcss(),
    ]).process(`
      @theme default {
        --color-blue-500: oklch(62.3% 0.214 259.815);
      }
      @source "./src";
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).toContain('width: 100px')
    expect(result.css).toContain('.bg-blue-500')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'dependency',
      file: resolveSourceScanPath(pageEntry),
    }))
  })

  it('discovers default source files relative to the current postcss input file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-auto-'))
    const cssEntry = path.join(root, 'app.css')
    const sourceDir = path.join(root, 'src')
    const pageEntry = path.join(sourceDir, 'page.wxml')
    const ignoredEntry = path.join(sourceDir, 'ignored.wxml')
    await mkdir(sourceDir)
    await writeFile(pageEntry, '<view class="bg-blue-500 w-[100px]"></view>', 'utf8')
    await writeFile(ignoredEntry, '<view class="text-[55rpx]"></view>', 'utf8')

    const result = await postcss([
      weappTailwindcss(),
    ]).process(`
      @theme default {
        --color-blue-500: oklch(62.3% 0.214 259.815);
      }
      @source not "./src/ignored.wxml";
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.bg-blue-500')
    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).not.toContain('.text-_b55rpx_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'weapp',
    }))
  })

  it('honors Tailwind v4 @source not entries for postcss local sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-v4-not-'))
    const cssEntry = path.join(root, 'app.css')
    const sourceDir = path.join(root, 'src')
    const pageEntry = path.join(sourceDir, 'pages', 'index.wxml')
    const ignoredEntry = path.join(sourceDir, 'apis', 'client.ts')
    await mkdir(path.dirname(pageEntry), { recursive: true })
    await mkdir(path.dirname(ignoredEntry), { recursive: true })
    await writeFile(pageEntry, '<view class="bg-blue-500 w-[100px]"></view>', 'utf8')
    await writeFile(ignoredEntry, 'export const cls = "text-[77rpx]"', 'utf8')

    const result = await postcss([
      weappTailwindcss(),
    ]).process(`
      @theme default {
        --color-blue-500: oklch(62.3% 0.214 259.815);
      }
      @source "./src";
      @source not "./src/apis/**";
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.bg-blue-500')
    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).not.toContain('.text-_b77rpx_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'dependency',
      file: resolveSourceScanPath(pageEntry),
    }))
    expect(result.messages).not.toContainEqual(expect.objectContaining({
      type: 'dependency',
      file: resolveSourceScanPath(ignoredEntry),
    }))
  })

  it('honors Tailwind v4 inline source detection in postcss generator mode', async () => {
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        projectRoot: repositoryRoot,
      }),
    ]).process(`
      @theme default {
        --color-red-100: #fee2e2;
        --color-red-200: #fecaca;
        --color-red-300: #fca5a5;
        --spacing: 0.25rem;
      }
      @source not ".";
      @source inline("{hover:,focus:,}underline w-{1..3}");
      @source inline("bg-red-{100..300..100}");
      @source not inline("focus:underline");
      @tailwind utilities;
    `, {
      from: undefined,
    })

    expect(result.css).toContain('.underline')
    expect(result.css).toContain('.hover\\:underline')
    expect(result.css).not.toContain('.focus\\:underline')
    expect(result.css).toContain('.w-1')
    expect(result.css).toContain('.w-2')
    expect(result.css).toContain('.w-3')
    expect(result.css).toContain('.bg-red-100')
    expect(result.css).toContain('.bg-red-200')
    expect(result.css).toContain('.bg-red-300')
    expect(result.css).not.toContain('@source')
  })

  it('keeps inline sources available when file source scanning is fully negated', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-inline-none-'))
    const cssEntry = path.join(root, 'app.css')
    const sourceDir = path.join(root, 'src')
    await mkdir(sourceDir)
    await writeFile(path.join(sourceDir, 'page.wxml'), '<view class="text-[88rpx]"></view>', 'utf8')

    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
        projectRoot: repositoryRoot,
      }),
    ]).process(`
      @theme default {
        --spacing: 0.25rem;
      }
      @source not "./src/**";
      @source inline(
        "underline w-{1..2}"
      );
      @source not inline("w-2");
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.underline')
    expect(result.css).toContain('.w-1')
    expect(result.css).not.toContain('.w-2')
    expect(result.css).not.toContain('.text-\\[88rpx\\]')
  })

  it('lets @source not inline remove candidates discovered from files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-inline-not-file-'))
    const cssEntry = path.join(root, 'app.css')
    const sourceDir = path.join(root, 'src')
    await mkdir(sourceDir)
    await writeFile(path.join(sourceDir, 'page.wxml'), '<view class="underline w-1"></view>', 'utf8')

    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
        },
        packageName: 'tailwindcss',
      }),
    ]).process(`
      @theme default {
        --spacing: 0.25rem;
      }
      @source "./src";
      @source not inline("underline");
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).not.toContain('.underline')
    expect(result.css).toContain('.w-1')
  })

  it('resolves @config paths relative to the current postcss input file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-config-'))
    const sourceDir = path.join(root, 'src')
    const cssEntry = path.join(sourceDir, 'app.css')
    const configFile = path.join(root, 'tailwind.config.js')
    await mkdir(sourceDir)
    await writeFile(configFile, 'export default { theme: { extend: { colors: { brand: "#123456" } } } }', 'utf8')

    const result = await postcss([
      weappTailwindcss({
        projectRoot: repositoryRoot,
        packageName: 'tailwindcss',
        candidates: ['bg-brand'],
      }),
    ]).process(`
      @config "../tailwind.config.js";
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.bg-brand')
    expect(result.css).toContain('#123456')
  })

  it('uses generator config for tailwind v4 source generation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-generator-config-'))
    const cssEntry = path.join(root, 'app.css')
    const configFile = path.join(root, 'tailwind.config.js')
    await writeFile(configFile, 'export default { theme: { extend: { colors: { brand: "#123456" } } } }', 'utf8')

    const result = await postcss([
      weappTailwindcss({
        packageName: 'tailwindcss',
        candidates: ['bg-brand'],
        generator: {
          config: configFile,
        },
      }),
    ]).process('@tailwind utilities;', {
      from: cssEntry,
    })

    expect(result.css).toContain('.bg-brand')
    expect(result.css).toContain('#123456')
  })

  it('honors Tailwind v4 content negation when collecting postcss local sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-v4-not-'))
    const sourceDir = path.join(root, 'src')
    const cssEntry = path.join(root, 'app.css')
    const pageEntry = path.join(sourceDir, 'pages', 'index.wxml')
    const ignoredEntry = path.join(sourceDir, 'apis', 'client.ts')
    await mkdir(path.dirname(pageEntry), { recursive: true })
    await mkdir(path.dirname(ignoredEntry), { recursive: true })
    await writeFile(pageEntry, '<view class="w-[300.31rpx] bg-brand"></view>', 'utf8')
    await writeFile(ignoredEntry, 'export const cls = "text-[77rpx]"', 'utf8')

    const result = await postcss([
      weappTailwindcss(),
    ]).process(`
      @theme default {
        --color-brand: #123456;
      }
      @source "./src";
      @source not "./src/apis/**";
      @tailwind utilities;
    `, {
      from: cssEntry,
    })

    expect(result.css).toContain('.w-_b300_d31rpx_B')
    expect(result.css).toContain('.bg-brand')
    expect(result.css).not.toContain('.text-_b77rpx_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'dependency',
      file: resolveSourceScanPath(pageEntry),
    }))
    expect(result.messages).not.toContainEqual(expect.objectContaining({
      type: 'dependency',
      file: ignoredEntry,
    }))
  })

  it('treats generator false as the default generator path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v5-postcss-default-'))
    const css = '.card { color: red; }'
    try {
      const result = await postcss([
        weappTailwindcss({
          generator: false,
          candidates: ['w-[100px]'],
        }),
      ]).process(css, {
        from: path.join(root, 'app.css'),
      })

      expect(result.css.replace(/\s+/g, ' ').trim()).toBe(css)
      expect(result.messages).toContainEqual(expect.objectContaining({
        type: 'weapp-tailwindcss:generated',
      }))
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { vi } from 'vitest'
import pluginDefault, { themeTransitionPlugin } from '@/tailwindcss'

type DarkModeConfig = string | [string, ...unknown[]]

const fixturePrefix = 'theme-transition-'
const require = createRequire(import.meta.url)
const tailwindVersion = require('tailwindcss/package.json').version as string

const tailwindMajor = Number(tailwindVersion.split('.')[0]) || 0
const isTailwindV4 = tailwindMajor >= 4
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')

function formatDarkMode(value: unknown): string {
  if (typeof value === 'function') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return `[${value.map(formatDarkMode).join(', ')}]`
  }

  return JSON.stringify(value)
}

function createFixture(darkMode?: DarkModeConfig) {
  const baseDir = fs.mkdtempSync(path.join(packageRoot, `.tmp-${fixturePrefix}`))
  const contentPath = path.join(baseDir, 'content.html')
  const configPath = path.join(baseDir, 'tailwind.config.cjs')
  const cssPath = path.join(baseDir, 'input.css')

  fs.writeFileSync(contentPath, '<div class="text-black dark:text-white"></div>')

  const darkModeLine = darkMode ? `  darkMode: ${formatDarkMode(darkMode)},\n` : ''
  fs.writeFileSync(
    configPath,
    `module.exports = {\n  content: ['./content.html'],\n  corePlugins: { preflight: false },\n${darkModeLine}};\n`,
  )

  return { baseDir, cssPath, cleanup: () => fs.rmSync(baseDir, { recursive: true, force: true }) }
}

async function runTailwind(darkMode?: DarkModeConfig) {
  if (isTailwindV4) {
    const { baseDir, cssPath, cleanup } = createFixture(darkMode)
    const css = [
      '@config "./tailwind.config.cjs";',
      '@plugin "theme-transition/tailwindcss";',
      '@import "tailwindcss";',
    ].join('\n')

    try {
      const { default: tailwindcss } = await import('@tailwindcss/postcss')
      const result = await postcss([
        tailwindcss({
          base: baseDir,
          optimize: false,
        }),
      ]).process(css, { from: cssPath })

      return result.css
    }
    finally {
      cleanup()
    }
  }

  const { default: tailwindcss } = await import('tailwindcss')
  const { css } = await postcss([tailwindcss({
    darkMode,
    content: [{
      raw: 'dark',
    }],
    corePlugins: {
      preflight: false,
    },
    plugins: [themeTransitionPlugin()],
  })]).process(`@tailwind base;
    @tailwind components;
    @tailwind utilities;`)

  return css
}

describe('tailwindcss', () => {
  it('exports matching default and named plugins', () => {
    expect(typeof pluginDefault).toBe('function')
    expect(pluginDefault).toBe(themeTransitionPlugin)
  })

  it('themeTransitionPlugin', async () => {
    const css = await runTailwind('media')

    expect(css).toContain('::view-transition-old(root)')
    expect(css).toContain('::view-transition-new(root)')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('[data-theme-transition="to-dark"]::view-transition-new(root)')
    expect(css).toContain('[data-theme-transition="from-dark"]::view-transition-old(root)')
    expect(css).toContain('var(--theme-transition-radius)')
    expect(css).toContain('[data-theme-transition-preset="circle"]')
    expect(css).toContain('[data-theme-transition-preset="fade"]')
    expect(css).toContain('[data-theme-transition-preset="wipe"]')
    expect(css).toContain('[data-theme-transition-preset="slide"]')
    expect(css).toContain('inset(0 0 0 100%)')
    expect(css).toContain('translate3d(16px, 0, 0)')
  })

  it('themeTransitionPlugin darkMode selector case 0', async () => {
    const css = await runTailwind('selector')

    expect(css).toContain('.dark::view-transition-old(root)')
    expect(css).toContain('.dark::view-transition-new(root)')
  })

  it('themeTransitionPlugin darkMode selector case 1', async () => {
    const css = await runTailwind(['selector', '[data-mode="dark"]'])

    expect(css).toContain('[data-mode="dark"]::view-transition-old(root)')
    expect(css).toContain('[data-mode="dark"]::view-transition-new(root)')
  })

  it('themeTransitionPlugin darkMode variant case 0', async () => {
    const css = await runTailwind(['variant', '&:not(.light *)'])

    expect(css).toContain('::view-transition-old(root)')
  })

  it('themeTransitionPlugin darkMode variant case 1', async () => {
    const css = await runTailwind([
      'variant',
      [
        '@media (prefers-color-scheme: dark) { &:not(.light *) }',
        '&:is(.dark *)',
      ],
    ])

    expect(css).toContain('::view-transition-old(root)')
  })

  it('warns when variant selectors are invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runTailwind(['variant', ['.dark', '.theme-mode']])

    const messages = warn.mock.calls.map(call => call[0])
    expect(messages.some(message => typeof message === 'string' && message.includes('must provide a selector'))).toBe(true)
    expect(messages.some(message => typeof message === 'string' && message.includes('must contain `&`'))).toBe(true)
    warn.mockRestore()
  })

  it('accepts functional variant selectors', async () => {
    const css = await runTailwind(['variant', () => '.app &'])

    expect(css).toContain('::view-transition-old(root)')
  })

  it('invokes addBase when using functional selectors without Tailwind runner', () => {
    const addBase = vi.fn()
    const config = vi.fn().mockReturnValue(['variant', () => '.shell &'])

    const pluginInstance: any = themeTransitionPlugin()
    const handler = typeof pluginInstance === 'function' ? pluginInstance : pluginInstance?.handler

    handler?.({ addBase, config })

    expect(addBase).toHaveBeenCalled()
  })

  it('handles missing selectors when variant mode is enabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runTailwind(['variant'])

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('tolerates non-string variant selectors when invoked directly', () => {
    const addBase = vi.fn()
    const config = vi.fn().mockReturnValue(['variant', null])

    const pluginInstance: any = themeTransitionPlugin()
    const handler = typeof pluginInstance === 'function' ? pluginInstance : pluginInstance?.handler

    handler?.({ addBase, config })
    expect(addBase).toHaveBeenCalled()
  })
})

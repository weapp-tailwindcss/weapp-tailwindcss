import type { Root } from 'postcss'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { processFrameworkCss } from '../src/framework-pipeline'
import { postcss, removeTailwindSourceDirectivesRoot } from '../src/index'

describe('framework CSS pipeline', () => {
  it.each(['cjs', 'mjs'])('loads absolute and relative %s plugin files from the source context', async (extension) => {
    const directory = await mkdtemp(join(tmpdir(), 'framework plugin '))
    const pluginFile = join(directory, `plugin.${extension}`)
    const source = '.a{color:red}'
    try {
      const factory = '(options) => ({ postcssPlugin: "fixture", Declaration(decl) { decl.value = options.color } })'
      await writeFile(pluginFile, `${extension === 'cjs' ? 'module.exports =' : 'export default'} ${factory}`)
      for (const specifier of [pluginFile, `./plugin.${extension}`]) {
        const result = await processFrameworkCss(source, {
          plugins: [[specifier, { color: 'blue' }]] as any,
          options: { from: join(directory, 'style.css') },
        })
        expect(result.css).toBe('.a{color:blue}')
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not load disabled plugins', async () => {
    const result = await processFrameworkCss('.a{color:red}', {
      plugins: [['missing-disabled-plugin', false]] as any,
    })
    expect(result.css).toBe('.a{color:red}')
  })

  it('executes a resolved preset-env tuple with its configured options', async () => {
    const pluginPath = createRequire(import.meta.url).resolve('postcss-preset-env')
    const result = await processFrameworkCss('.a{user-select:none}', {
      plugins: [[pluginPath, { browsers: ['Safari 12'], stage: false }]] as any,
    })
    expect(result.css).toContain('-webkit-user-select:none')
  })

  it('preserves legacy transformer functions and Processor plugin packs', async () => {
    const transformer = (root: Root) => { root.walkDecls(decl => { decl.value = 'blue' }) }
    const pack = postcss([{ postcssPlugin: 'pack', Declaration(decl) { decl.value = 'green' } }])
    const legacy = await processFrameworkCss('.a{color:red}', { plugins: [transformer] })
    expect(legacy.css).toBe('.a{color:blue}')
    const packed = await processFrameworkCss('.a{color:red}', { plugins: [pack] })
    expect(packed.css).toBe('.a{color:green}')
  })

  it('rejects invalid and missing plugins instead of silently omitting them', async () => {
    await expect(processFrameworkCss('.a{color:red}', { plugins: [{}] as any })).rejects.toThrow()
    await expect(processFrameworkCss('.a{color:red}', { plugins: ['missing-framework-plugin'] as any })).rejects.toThrow()
  })
  it('runs configured plugins in order without mini-program transformations', async () => {
    const source = '@layer reset,theme,utilities;@supports(display:grid){.hover\\:block:hover{color:red}}'
    const result = await processFrameworkCss(source, {
      plugins: [
        { postcssPlugin: 'first', Once(root) { root.walkDecls(decl => { decl.value = 'blue' }) } },
        { postcssPlugin: 'second', Once(root) { root.walkDecls(decl => { decl.value += '-second' }) } },
      ],
      options: { from: 'style.css' },
    })
    expect(result.css).toBe(source.replace('red', 'blue-second'))
  })

  it('keeps Web layer statements and empty layers when removing source directives', () => {
    const root = postcss.parse('@layer a,b;@layer empty{}@source "./src";@theme{--color-brand:red}@layer a{button{color:red}}')
    expect(removeTailwindSourceDirectivesRoot(root, { preserveCssLayers: true })).toBe(true)
    expect(root.toString()).toBe('@layer a,b;@layer empty{}@layer a{button{color:red}}')
  })

  it('normalizes loader tuple and ESM default plugin shapes', async () => {
    const plugin = (suffix: string) => ({
      postcssPlugin: `tuple-${suffix}`,
      Once(root: any) {
        root.walkDecls((decl: any) => { decl.value += `-${suffix}` })
      },
    })
    const result = await processFrameworkCss('.a{color:red}', {
      plugins: [[{ default: plugin }, 'one'] as any],
      options: { from: 'style.css' },
    })
    expect(result.css).toBe('.a{color:red-one}')
  })
})

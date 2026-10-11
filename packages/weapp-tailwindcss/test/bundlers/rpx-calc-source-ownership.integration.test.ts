import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { generateTailwindV4Css } from '@/generation/service'

const modes = ['legacy', 'graph'].flatMap(compiler => [false, true].map(deferred => ({ compiler, deferred })))

function declarationValues(css: string, selector: string, property: string) {
  const values: string[] = []
  postcss.parse(css).walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls(property, decl => { values.push(decl.value.replace(/\s+/g, '')) })
    }
  })
  return values
}

async function createContext(deferred: boolean) {
  const directory = await mkdtemp(path.join(tmpdir(), 'weapp-tw-rpx-ownership-'))
  const entries = [path.join(directory, 'alpha.css'), path.join(directory, 'beta.css')]
  const sources = ['alpha', 'beta'].map((name, index) => `@import 'tailwindcss' source(none); @theme { --spacing: ${index + 1}rpx; } @utility source-${name} { z-index: ${(index + 1) * 101}; }`)
  await Promise.all(entries.map((file, index) => writeFile(file, sources[index]!)))
  const opts = getCompilerContext({
    tailwindcssBasedir: process.cwd(),
    cssEntries: entries,
    generator: { target: 'weapp' },
    cssPreflight: false,
    cssCalc: ['--spacing'],
    logLevel: 'silent',
  })
  const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
  let replayed = 0
  if (deferred) {
    captureFrameworkPostcssOptions(opts, { plugins: [{
      postcssPlugin: 'rpx-ownership-framework',
      Once() { replayed += 1 },
    }] })
  }
  return {
    entries,
    sources,
    replayed: () => replayed,
    async generate(file: string, rawSource: string, outputFile: string) {
      return generateTailwindV4Css({
        opts,
        runtimeState,
        file,
        rawSource,
        outputFile,
        runtime: new Set(['w-32', 'p-4', 'source-alpha', 'source-beta']),
        disableSourceScan: true,
        cssHandlerOptions: { majorVersion: 4, isMainChunk: true, sourceOptions: { cssEntries: entries } },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
        restoreLocalCssImports: false,
        ...(deferred ? { cssStage: 'framework-processed' as const } : {}),
      })
    },
    async close() {
      await disposeCompilerOwner(runtimeState)
      await rm(directory, { recursive: true, force: true })
    },
  }
}

afterEach(() => { vi.unstubAllEnvs() })

describe.each(modes)('rpx calc source ownership: $compiler deferred=$deferred', ({ compiler, deferred }) => {
  it('保留同一输出中多个真实主题源的冲突语义', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', compiler)
    const context = await createContext(deferred)
    try {
      const result = await context.generate(path.join(path.dirname(context.entries[0]!), 'combined.css'), '@tailwind utilities;', 'shared-output.wxss')
      expect(result).toBeDefined()
      expect(declarationValues(result!.css, '.source-alpha', 'z-index')).toEqual(['101'])
      expect(declarationValues(result!.css, '.source-beta', 'z-index')).toEqual(['202'])
      for (const [selector, property, multiple] of [['.w-32', 'width', '32'], ['.p-4', 'padding', '4']]) {
        const values = declarationValues(result!.css, selector!, property!)
        expect(values.length).toBeGreaterThan(0)
        expect(values.every(value => value === `calc(var(--spacing)*${multiple})`), result!.css).toBe(true)
      }
      expect(result!.classSet).toEqual(new Set(['w-32', 'p-4', 'source-alpha', 'source-beta']))
      if (compiler === 'graph') {
        expect(result!.snapshot?.roots).toHaveLength(2)
      }
      if (deferred) {
        expect(context.replayed()).toBeGreaterThan(0)
      }
    }
    finally {
      await context.close()
    }
  })

  it('同一会话的不同输出只消费匹配入口的主题上下文', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', compiler)
    const context = await createContext(deferred)
    try {
      for (const index of [0, 1, 0]) {
        const result = await context.generate(context.entries[index]!, context.sources[index]!, `isolated-${index}.wxss`)
        expect(result).toBeDefined()
        const ownSource = ['source-alpha', 'source-beta'][index]!
        const otherSource = ['source-alpha', 'source-beta'][1 - index]!
        expect(declarationValues(result!.css, `.${ownSource}`, 'z-index')).toEqual([String((index + 1) * 101)])
        expect(declarationValues(result!.css, `.${otherSource}`, 'z-index')).toEqual([])
        const widths = declarationValues(result!.css, '.w-32', 'width')
        expect(widths.length).toBeGreaterThan(0)
        expect(widths.every(value => value === `${(index + 1) * 32}rpx`), result!.css).toBe(true)
        expect(result!.classSet).toEqual(new Set(['w-32', 'p-4', ownSource]))
        if (compiler === 'graph') {
          expect(result!.snapshot?.roots).toHaveLength(1)
        }
      }
      if (deferred) {
        expect(context.replayed()).toBeGreaterThan(0)
      }
    }
    finally {
      await context.close()
    }
  })
})

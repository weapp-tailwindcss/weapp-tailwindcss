import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { createCompilerContext } from '@/context'
import { generateTailwindV4Css } from '@/context/generation'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { createWebRpxFinalizerPlugin } from '@/generation/web-rpx-finalizer'

const require = createRequire(new URL('../../../../demo/gulp-tailwindcss-v4/package.json', import.meta.url))
const pxtransform = require('postcss-pxtransform')

describe('Web 生成与框架单位转换的阶段边界', () => {
  const scenarios = [false, true].flatMap(webCompat => ['legacy', 'graph'].flatMap(mode => [
    { webCompat, mode, pipeline: 'h5', stage: 'framework-processed' as const, expected: '0.4rem' },
    { webCompat, mode, pipeline: 'h5', stage: 'raw' as const, expected: '0.4rem' },
    { webCompat, mode, pipeline: 'unrelated', stage: 'framework-processed' as const, expected: '0.5rem' },
    { webCompat, mode, pipeline: 'unrelated', stage: 'raw' as const, expected: '0.5rem' },
    { webCompat, mode, pipeline: 'none', stage: 'framework-processed' as const, expected: '0.5rem' },
  ]))
  it.each(scenarios)('$pipeline/$stage/$mode 在框架处理之后兜底（webCompat=$webCompat）', async ({ webCompat, mode, pipeline, stage, expected }) => {
    vi.stubEnv('TARO_ENV', 'h5')
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', mode)
    const directory = await mkdtemp(path.join(tmpdir(), 'weapp-tw-framework-web-units-'))
    const file = path.join(directory, 'entry.css')
    const opts = createCompilerContext({
      tailwindcssBasedir: process.cwd(),
      cssEntries: [file],
      generator: { target: 'web', webCompat, styleOptions: { px2rpx: true } },
      cssPreflight: false,
      rem2rpx: false,
    })
    const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
    try {
      const vendor = '.vendor{padding:16px;color:red}.override{color:blue}'
      const source = `@import "tailwindcss" source(none);\n@import "./vendor.css";\n@source inline("p-[16px] text-[32rpx]");`
      await writeFile(path.join(directory, 'vendor.css'), vendor)
      await writeFile(file, source)
      const framework = pipeline === 'h5'
        ? pxtransform({ platform: 'h5', designWidth: 750, deviceRatio: { 750: 1 } })
        : { postcssPlugin: 'unrelated-framework', Once() {} }
      const plugins = [framework, ...(stage === 'raw' ? [createWebRpxFinalizerPlugin()] : [])]
      if (pipeline !== 'none') {
        captureFrameworkPostcssOptions(opts, { plugins })
      }
      const processedVendor = (await postcss([framework]).process(vendor, { from: file })).css
      const result = await generateTailwindV4Css({
        opts,
        runtimeState,
        runtime: new Set(['p-[16px]', 'text-[32rpx]']),
        rawSource: source,
        frameworkProcessedUserCss: pipeline === 'h5' && stage === 'framework-processed' ? processedVendor : undefined,
        file,
        cssStage: stage,
        cssHandlerOptions: { majorVersion: 4, isMainChunk: true, sourceOptions: { cssEntries: [file], sourceFile: file } },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
        restoreLocalCssImports: false,
      })
      expect(result).toBeDefined()
      const css = stage === 'raw' ? (await postcss(plugins).process(result!.css, { from: file })).css : result!.css
      const values: Record<string, string[]> = { vendor: [], utility: [] }
      const fontSizes: string[] = []
      const authorRuleOrder: string[] = []
      postcss.parse(css).walkRules((rule) => {
        if (rule.selector === '.vendor' || rule.selector === '.override') {
          authorRuleOrder.push(rule.selector)
        }
        if (rule.selector.startsWith('.text-')) {
          rule.walkDecls('font-size', (declaration) => {
            fontSizes.push(declaration.value)
          })
          rule.walkDecls('color', () => {
            throw new Error('rpx 长度候选不能生成颜色声明')
          })
        }
        const key = rule.selector === '.vendor' ? 'vendor' : rule.selector.startsWith('.p-') ? 'utility' : undefined
        if (key) {
          rule.walkDecls('padding', (declaration) => {
            values[key].push(declaration.value)
          })
        }
      })
      expect(values.vendor).toEqual([expected])
      expect(values.utility).toEqual([expected])
      expect(fontSizes).toEqual([pipeline === 'h5' ? '0.8rem' : '1rem'])
      expect(authorRuleOrder).toEqual(['.vendor', '.override'])
    }
    finally {
      vi.unstubAllEnvs()
      await disposeCompilerOwner(runtimeState)
      await rm(directory, { recursive: true, force: true })
    }
  })
})

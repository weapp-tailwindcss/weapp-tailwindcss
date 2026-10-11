import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { warnFinalRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { generateTailwindV4Css } from '@/generation/service'

describe('rpx warning with real Tailwind generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const scenarios = [
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'warn', inline: false, calc: false, replay: false, warnings: 1 },
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'warn', inline: true, calc: false, replay: true, warnings: 1 },
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'warn', inline: true, calc: true, replay: true, warnings: 0 },
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'silent', inline: false, calc: false, replay: false, warnings: 0 },
    { platform: 'mp-alipay', target: 'weapp', logLevel: 'warn', inline: false, calc: false, replay: false, warnings: 0 },
    { platform: 'h5', target: 'web', logLevel: 'warn', inline: false, calc: false, replay: false, warnings: 0 },
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'warn', inline: false, calc: false, replay: false, warnings: 0, spacing: '1px' },
    { platform: 'mp-weixin', target: 'weapp', logLevel: 'warn', inline: false, calc: false, replay: false, warnings: 1, imported: true },
  ] as const

  it.each(scenarios.flatMap(scenario => ['legacy', 'graph'].map(compiler => ({ ...scenario, compiler }))))('keeps output semantics and warning policy: %j', async (scenario) => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', scenario.compiler)
    const directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-rpx-warning-'))
    const opts = getCompilerContext({
      tailwindcssBasedir: process.cwd(),
      generator: { target: scenario.target },
      platform: scenario.platform,
      logLevel: scenario.logLevel,
      cssPreflight: false,
      cssCalc: scenario.calc ? ['--spacing'] : false,
    })
    const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    if (scenario.replay) {
      captureFrameworkPostcssOptions(opts, { plugins: [{ postcssPlugin: 'rpx-warning-framework', Once() {} }] })
    }
    try {
      const file = path.join(directory, 'theme-entry.css')
      const theme = `@theme ${scenario.inline ? 'inline' : ''} { --spacing: ${'spacing' in scenario ? scenario.spacing : '3rpx'}; }`
      const imported = 'imported' in scenario && scenario.imported
      if (imported) {
        await writeFile(path.join(directory, 'tokens.css'), theme)
      }
      const source = `@import "tailwindcss" source(none); ${imported ? '@import "./tokens.css";' : theme}`
      await writeFile(file, source)
      const input = {
        opts,
        runtimeState,
        file,
        disableSourceScan: true,
        runtime: new Set(['p-8']),
        rawSource: source,
        outputFile: 'theme-output.css',
        cssHandlerOptions: { majorVersion: 4 as const, isMainChunk: true, sourceOptions: { cssEntries: [file], sourceFile: file } },
        cssUserHandlerOptions: { majorVersion: 4 as const, isMainChunk: false },
        styleHandler: opts.styleHandler,
        generatorPlatform: scenario.platform,
        debug: () => {},
        restoreLocalCssImports: false,
        ...(scenario.replay ? { cssStage: 'framework-processed' as const } : {}),
      }
      const first = await generateTailwindV4Css(input)
      const second = await generateTailwindV4Css(input)
      expect(first?.classSet.has('p-8')).toBe(true)
      expect(second?.css).toBe(first?.css)
      expect(second?.classSet).toEqual(first?.classSet)
      expect(warn).not.toHaveBeenCalled()
      if (scenario.target === 'weapp') {
        warnFinalRpxThemeRisk(runtimeState, [first!.css, second!.css], opts, scenario.platform)
      }
      expect(warn).toHaveBeenCalledTimes(scenario.warnings)
      if (scenario.warnings) {
        expect(warn.mock.calls[0]?.[0]).toContain(scenario.inline ? '内联 rpx' : '--spacing')
        expect(warn.mock.calls[0]?.[0]).toContain('最终样式仍含 rpx 运行时 calc')
      }
      if (scenario.calc) {
        expect(first?.css).toMatch(/padding:\s*24rpx/)
      }
      if (scenario.warnings) {
        opts.logLevel = 'silent'
        const muted = await generateTailwindV4Css(input)
        opts.logLevel = scenario.logLevel
        expect(muted?.css).toBe(first?.css)
        expect(muted?.classSet).toEqual(first?.classSet)
        const nextRuntimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
        try {
          const regenerated = await generateTailwindV4Css({ ...input, runtimeState: nextRuntimeState })
          warnFinalRpxThemeRisk(nextRuntimeState, [regenerated!.css], opts, scenario.platform)
          expect(warn).toHaveBeenCalledTimes(2)
        }
        finally {
          await disposeCompilerOwner(nextRuntimeState)
        }
      }
    }
    finally {
      await disposeCompilerOwner(runtimeState)
      await rm(directory, { recursive: true, force: true })
    }
  })
})

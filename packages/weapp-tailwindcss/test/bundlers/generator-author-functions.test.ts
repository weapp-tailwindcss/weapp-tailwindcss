import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { generateTailwindV4Css } from '@/generation/service'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'

describe('generator author function replay', () => {
  it.each([false, true])('compiles every replayed declaration using its theme context (processed=%s)', async (processed) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-author-functions-'))
    const opts = getCompilerContext({
      tailwindcssBasedir: process.cwd(),
      generator: { target: 'weapp' },
      cssPreflight: false,
      rem2rpx: true,
    })
    const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
    if (processed) {
      captureFrameworkPostcssOptions(opts, { plugins: [{ postcssPlugin: 'framework-author-css-regression', Once() {} }] })
    }
    try {
      const file = path.join(directory, 'theme-entry.css')
      const author = `.probe{padding:7px}.probe{padding:theme('spacing.2');margin-left:theme('spacing.3')}`
      const source = `@import "tailwindcss";\n@theme { --spacing: 0.5rem; }\n${author}`
      await writeFile(file, source)
      const result = await generateTailwindV4Css({
        opts,
        runtimeState,
        runtime: new Set(['flex']),
        rawSource: source,
        userRawSource: author,
        ...(processed ? {
          frameworkProcessedUserCss: `/*! weapp-tailwindcss generator-placeholder */\n${author}`,
          cssStage: 'framework-processed' as const,
        } : {}),
        file,
        outputFile: 'entry.acss',
        cssHandlerOptions: { majorVersion: 4, isMainChunk: true, sourceOptions: { cssEntries: [file], sourceFile: file } },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
        restoreLocalCssImports: false,
      })
      expect(result).toBeDefined()
      expect(result!.css).not.toContain('theme(')
      const paddings: string[] = []
      postcss.parse(result!.css).walkRules('.probe', (rule) => {
        rule.walkDecls('padding', declaration => { paddings.push(declaration.value) })
      })
      expect(paddings.at(-1)).toBe('16rpx')
      expect(result!.css).toMatch(/margin-left:\s*24rpx/)
    }
    finally {
      await disposeCompilerOwner(runtimeState)
      await rm(directory, { recursive: true, force: true })
    }
  })
})

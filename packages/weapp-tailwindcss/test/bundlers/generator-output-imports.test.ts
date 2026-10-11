import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { generateTailwindV4Css } from '@/generation/service'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'

describe('generator output import boundaries', () => {
  it.each(['wxss', 'acss', 'ttss'])('preserves framework %s imports without resolving them as source dependencies', async (extension) => {
    const opts = getCompilerContext({
      tailwindcssBasedir: process.cwd(),
      generator: { target: 'weapp' },
      cssPreflight: false,
    })
    const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
    const file = path.resolve('screen.css')
    const outputImport = `@import "/framework-reset.${extension}";`
    const source = `${outputImport}\n@import "tailwindcss";\n.probe { @apply flex; }`
    try {
      const result = await generateTailwindV4Css({
        opts,
        runtimeState,
        runtime: new Set(['flex']),
        rawSource: source,
        cssSources: [{ css: source, file, base: process.cwd() }],
        file,
        outputFile: `screen.${extension}`,
        cssHandlerOptions: { majorVersion: 4, isMainChunk: true },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
      })
      expect(result?.css).toContain(outputImport)
      expect(result?.css).toMatch(/display:\s*flex/)
      expect(result?.css).not.toContain('@apply')
      expect(result?.dependencies.some(dependency => dependency.includes('framework-reset'))).toBe(false)
    }
    finally {
      await disposeCompilerOwner(runtimeState)
    }
  })
})

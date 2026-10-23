import type { TailwindV4GenerationCoreInput } from '@/context/generation'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createWebpackGeneratorRequestOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/generator-request'
import { disposeCompilerOwner } from '@/compiler'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'
import { createCompilerContext } from '@/context'
import { generateTailwindV4Css } from '@/context/generation'

function createGate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function createFixture() {
  const firstFile = path.resolve('test-fixtures', 'entry-one.css')
  const secondFile = path.resolve('test-fixtures', 'entry-two.css')
  const context = createCompilerContext({
    appType: 'mpx',
    generator: false,
    logLevel: 'silent',
    cssPreflight: false,
    cssEntries: [firstFile, secondFile],
  })
  const runtimeState = createCompilerRuntimeState({
    tailwindRuntime: context.tailwindRuntime,
    refreshTailwindcssRuntime: context.refreshTailwindcssRuntime,
  })
  const entered = createGate()
  const pending = createGate()
  const transform = vi.fn(async (_css: string, options?: { postcssOptions?: { options?: { from?: string } } }) => {
    if (options?.postcssOptions?.options?.from === firstFile) {
      entered.release()
      await pending.promise
      return { css: '.first { color: red; }' }
    }
    return { css: '.second { color: blue; }' }
  })

  function request(file: string, candidate: string): TailwindV4GenerationCoreInput {
    return {
      ...createWebpackGeneratorRequestOptions(context, {
        postcssOptions: {
          options: { from: file },
          plugins: [{ postcssPlugin: 'scoped-request-test' }],
        },
      }, file),
      runtimeState,
      runtime: new Set([candidate]),
      rawSource: '@import "tailwindcss";',
      file,
      outputFile: file,
      frameworkPostcssOwner: context,
      cssStage: 'raw',
      cssUserHandlerOptions: {},
      styleHandler: transform as unknown as TailwindV4GenerationCoreInput['styleHandler'],
      debug: vi.fn(),
    }
  }

  return { context, runtimeState, firstFile, secondFile, entered, pending, transform, request }
}

describe('webpack source selection and owner configuration', () => {
  it('keeps both results when different CSS scopes finish out of order in one owner', async () => {
    const fixture = createFixture()
    const first = generateTailwindV4Css(fixture.request(fixture.firstFile, 'first'))
    try {
      await fixture.entered.promise
      const second = await generateTailwindV4Css(fixture.request(fixture.secondFile, 'second'))
      fixture.pending.release()
      const firstResult = await first

      expect(firstResult?.css).toContain('.first')
      expect(firstResult?.classSet).toEqual(new Set(['first']))
      expect(second?.css).toContain('.second')
      expect(second?.classSet).toEqual(new Set(['second']))
      expect(fixture.context.cssEntries).toEqual([fixture.firstFile, fixture.secondFile])
      expect(fixture.transform).toHaveBeenCalledTimes(2)
    }
    finally {
      fixture.pending.release()
      await Promise.allSettled([first])
      await disposeCompilerOwner(fixture.runtimeState)
    }
  })

  it.each(['preflight', 'entries'] as const)('still discards an accepted result when the owner %s configuration changes', async (configuration) => {
    const fixture = createFixture()
    const first = generateTailwindV4Css(fixture.request(fixture.firstFile, 'first'))
    try {
      await fixture.entered.promise
      if (configuration === 'preflight') {
        fixture.context.cssPreflight = { border: false }
      }
      else {
        fixture.context.cssEntries = [fixture.secondFile]
      }
      const second = await generateTailwindV4Css(fixture.request(fixture.secondFile, 'second'))
      fixture.pending.release()

      await expect(first).resolves.toBeUndefined()
      expect(second?.css).toContain('.second')
      expect(second?.classSet).toEqual(new Set(['second']))
    }
    finally {
      fixture.pending.release()
      await Promise.allSettled([first])
      await disposeCompilerOwner(fixture.runtimeState)
    }
  })
})

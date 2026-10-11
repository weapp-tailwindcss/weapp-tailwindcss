import type { GeneratorPipelineOutputContext } from '@/generation/pipeline/context'
import type { UserDefinedOptions } from '@/types'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { generateCssByGenerator } from '@/generation'
import { finalizeDeferredGeneratorCss } from '@/generation/pipeline/deferred-output'

const utility = 'group-[:nth-of-type(3)_&]:block'
const rawClass = '.group-\\[\\:nth-of-type\\(3\\)_\\&\\]\\:block'

it.each([
  { name: 'legacy custom elements', options: { cssSelectorReplacement: { universal: 'custom-view' } }, selector: ':where(.group) custom-view)' },
  { name: 'nested selector-list', options: { cssOptions: { cssSelectorReplacement: { universal: 'view,custom-text' } } }, selector: ':where(.group) :is(view,custom-text))' },
  { name: 'nested disabled replacement', options: { cssSelectorReplacement: { universal: 'legacy-view' }, cssOptions: { cssSelectorReplacement: { universal: false } } }, selector: ':where(.group) *)' },
])('uses $name in full and incremental deferred generation', async ({ options, selector }) => {
  const runtimeState = { tailwindRuntime: { majorVersion: 4 } as any, readyPromise: Promise.resolve() }
  const file = path.resolve('test/fixtures/deferred-group.css')
  const generate = (candidates: string[]) => generateCssByGenerator({
    opts: { ...options, generator: { target: 'weapp' } } as UserDefinedOptions as any,
    runtimeState,
    runtime: new Set(candidates),
    rawSource: '@import "tailwindcss" source(none);',
    file,
    cssHandlerOptions: { isMainChunk: true, majorVersion: 4 },
    cssUserHandlerOptions: {},
    styleHandler: vi.fn(),
    debug: vi.fn(),
    deferCssAdaptation: true,
    disableSourceScan: true,
  })

  const full = await generate([utility])
  expect(full?.css).toContain(rawClass)
  expect(full?.css).toContain(selector)
  // 引擎可按级联风险选择全量重建；这里将真实生成的 delta 交给增量组装边界。
  const incremental = await finalizeDeferredGeneratorCss({
    options: { deferCssAdaptation: true, previousCss: '.flex{display:flex}', previousClassSet: new Set(['flex']) },
    opts: {},
    file,
    filterGeneratedApplyOnlyCss: (css: string) => css,
    generated: { target: 'weapp', rawCss: full!.metadata!.rawCss, incrementalRawCss: full!.metadata!.rawCss, classSet: full!.classSet, dependencies: [] },
    generatorRawSource: '@import "tailwindcss" source(none);',
    generatorStyleOptions: options,
    runtimeWithCurrentCss: new Set(['flex', utility]),
    majorVersion: 4,
  } as unknown as GeneratorPipelineOutputContext)
  expect(incremental?.incremental).toBe(true)
  expect(incremental?.css).toContain('.flex')
  expect(incremental?.css).toContain(rawClass)
  expect(incremental?.css).toContain(selector)
  expect(incremental?.classSet).toContain(utility)
})

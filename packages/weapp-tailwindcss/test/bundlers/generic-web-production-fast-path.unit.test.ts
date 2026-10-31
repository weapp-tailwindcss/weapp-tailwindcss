import { describe, expect, it, vi } from 'vitest'
import { createGenericWebProductionBundleHooks, shouldSkipGenericWebProductionSourceCandidates, shouldUseGenericWebFinalizerFastPath, shouldUseGenericWebProductionFastPath } from '@/bundlers/vite/shared/generic-web-production-fast-path'

describe('generic Web production fast path', () => {
  const productionWeb = {
    command: 'build' as const,
    allowWebProductionFastPath: true,
    hasGeneratedCss: true,
    isWebGeneratorTarget: true,
    requiresSourceCandidateState: false,
    watch: undefined,
  }

  it('only enables the fast path for Generic Web production builds with generated CSS', () => {
    expect(shouldUseGenericWebProductionFastPath(productionWeb)).toBe(true)
  })

  it('skips duplicate source candidate state before css generation starts', () => {
    expect(shouldSkipGenericWebProductionSourceCandidates(productionWeb)).toBe(true)
  })

  it.each([
    ['Vite dev', { command: 'serve' as const }],
    ['Vite watch build', { watch: {} }],
    ['CSS source tracing', { requiresSourceCandidateState: true }],
    ['mini-program target', { isWebGeneratorTarget: false }],
    ['未启用生产 CSS 快速路径的框架', { allowWebProductionFastPath: false }],
  ])('keeps the full pipeline for %s', (_label, overrides) => {
    const options = {
      ...productionWeb,
      ...overrides,
    }
    expect(shouldSkipGenericWebProductionSourceCandidates(options)).toBe(false)
    expect(shouldUseGenericWebProductionFastPath(options)).toBe(false)
  })

  it('skips source candidate state before generated css is recorded', () => {
    const options = {
      ...productionWeb,
      hasGeneratedCss: false,
    }
    expect(shouldSkipGenericWebProductionSourceCandidates(options)).toBe(true)
    expect(shouldUseGenericWebProductionFastPath(options)).toBe(false)
  })

  it('来源追踪启用时仍执行完整 bundle 管线', () => {
    const hooks = createGenericWebProductionBundleHooks({
      allowWebProductionFastPath: true,
      requiresSourceCandidateState: true,
      getHasGeneratedCss: () => true,
      getIsWebGeneratorTarget: () => true,
      getResolvedConfig: () => ({ command: 'build', build: {} }) as any,
      onStart: vi.fn(),
      onEnd: vi.fn(),
    })
    expect(hooks.shouldProcessBundle()).toBe(true)
  })

  it('最终资产采集资格不依赖生成阶段是否已登记可重放 CSS', () => {
    const options = {
      ...productionWeb,
      hasGeneratedCss: false,
      hasFrameworkRootImportShells: false,
      isHarmonyAppStyleTarget: false,
      isNativeAppStyleTarget: false,
    }
    expect(shouldUseGenericWebProductionFastPath(options)).toBe(false)
    expect(shouldUseGenericWebFinalizerFastPath(options)).toBe(true)
  })

  it.each([
    ['framework root import shell', { hasFrameworkRootImportShells: true }],
    ['Harmony app styles', { isHarmonyAppStyleTarget: true }],
    ['native app styles', { isNativeAppStyleTarget: true }],
  ])('keeps the full finalizer for %s', (_label, overrides) => {
    expect(shouldUseGenericWebFinalizerFastPath({
      ...productionWeb,
      hasFrameworkRootImportShells: false,
      isHarmonyAppStyleTarget: false,
      isNativeAppStyleTarget: false,
      ...overrides,
    })).toBe(false)
  })
})

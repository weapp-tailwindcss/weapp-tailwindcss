import { describe, expect, it } from 'vitest'
import { shouldSkipGenericWebProductionSourceCandidates, shouldUseGenericWebFinalizerFastPath, shouldUseGenericWebProductionFastPath } from '@/bundlers/vite/shared/generic-web-production-fast-path'

describe('generic Web production fast path', () => {
  const productionWeb = {
    command: 'build' as const,
    allowWebProductionFastPath: true,
    hasProcessedCss: true,
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
      hasProcessedCss: false,
    }
    expect(shouldSkipGenericWebProductionSourceCandidates(options)).toBe(true)
    expect(shouldUseGenericWebProductionFastPath(options)).toBe(false)
  })

  it('enables the finalizer fast path only without platform-specific css structures', () => {
    expect(shouldUseGenericWebFinalizerFastPath({
      ...productionWeb,
      hasFrameworkRootImportShells: false,
      isHarmonyAppStyleTarget: false,
      isNativeAppStyleTarget: false,
    })).toBe(true)
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

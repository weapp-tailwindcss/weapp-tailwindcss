import { afterEach, expect, it, vi } from 'vitest'
import { selectorOptionMutationScenarios, transformRule } from '../helpers/selector-options-mutation'

afterEach(() => vi.unstubAllEnvs())

it.each(selectorOptionMutationScenarios)('复用 options 原生与 JS 一致：$name', (scenario) => {
  const nativeOptions = scenario.options()
  const legacyOptions = scenario.options()
  vi.stubEnv('WEAPP_TW_NATIVE', 'required')
  transformRule(scenario.warmup ?? scenario.source, nativeOptions)
  vi.stubEnv('WEAPP_TW_NATIVE', 'off')
  transformRule(scenario.warmup ?? scenario.source, legacyOptions)
  for (const change of scenario.changes) {
    change(nativeOptions)
    change(legacyOptions)
    const expected = transformRule(scenario.source, structuredClone(legacyOptions))
    expect(transformRule(scenario.source, legacyOptions)).toBe(expected)
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(transformRule(scenario.source, nativeOptions)).toBe(expected)
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
  }
})

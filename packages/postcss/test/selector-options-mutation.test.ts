import { afterEach, expect, it, vi } from 'vitest'
import { selectorOptionMutationScenarios, transformRule } from './helpers/selector-options-mutation'

afterEach(() => vi.unstubAllEnvs())

it.each(selectorOptionMutationScenarios)('复用 JS options：$name', (scenario) => {
  vi.stubEnv('WEAPP_TW_NATIVE', 'off')
  const options = scenario.options()
  transformRule(scenario.warmup ?? scenario.source, options)
  for (const change of scenario.changes) {
    change(options)
    expect(transformRule(scenario.source, options)).toBe(transformRule(scenario.source, structuredClone(options)))
  }
})

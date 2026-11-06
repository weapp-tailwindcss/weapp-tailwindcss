import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { fixtureBaseline } from './tailwind-capabilities/baseline'
import { weappProbes } from './tailwind-capabilities/weapp/fixtures'
import { generateWeappProbeCss } from './tailwind-capabilities/weapp/generate'

const root = fileURLToPath(new URL('..', import.meta.url))
it('static 基线禁止更新复验，兼容组和 strict 限制组并存', async () => {
  const output = await fixtureBaseline(root, false)
  const css = output.files['weapp.wxss']
  expect(css).toContain('rgba(18, 52, 86, var(--alpha-compat))')
  expect(css).toContain('rgba(18, 52, 86, var(--alpha-compat-fallback,50%))')
  expect(css).not.toContain('rgba(0, 165, 234, var(--my-alpha-value))')
}, 120_000)

it('拒绝跨模式共享候选，防止兼容规则覆盖 strict 负例', async () => {
  const probe = weappProbes.find(probe => probe.id === 'alpha-compat-runtime')!
  await expect(generateWeappProbeCss(root, [probe, { ...probe, colorMixDynamicAlpha: 'strict' }])).rejects.toThrow('跨透明度模式')
})

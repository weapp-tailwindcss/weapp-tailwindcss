import type { WeappProbe } from './types'
import { withGeneratorFixture } from '../fixture'
import { weappFixtureCss } from './alpha-fixtures'

/** runner 与 static 基线共用模式分组，分别验证缺省、严格和显式兼容配置。 */
export async function generateWeappProbeCss(root: string, probes: readonly WeappProbe[]) {
  const outputs: string[] = []
  const owners = new Map<string, string>()
  for (const mode of ['default', 'strict', 'rgba'] as const) {
    const candidates = [...new Set(probes.filter(probe => (probe.colorMixDynamicAlpha ?? 'default') === mode).flatMap(probe => [...probe.candidates]))]
    if (!candidates.length) {
      continue
    }
    for (const candidate of candidates) {
      if (owners.has(candidate)) {
        throw new Error(`微信候选不能跨透明度模式复用：${candidate}`)
      }
      owners.set(candidate, mode)
    }
    const generated = await withGeneratorFixture(root, weappFixtureCss, {}, generator => generator.generate({
      target: 'weapp',
      candidates,
      scanSources: false,
      ...(mode === 'default' ? {} : { styleOptions: { cssOptions: { colorMixDynamicAlpha: mode } } }),
    }))
    outputs.push(generated.css)
  }
  return { css: outputs.join('\n') }
}

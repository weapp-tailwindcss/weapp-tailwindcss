import { expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { nativeMediaAssertions, nativeMediaContract } from './tailwind-capabilities/web-native-media/contract'
import { syntheticMedia } from './tailwind-capabilities/web-native-media/test-fixture'

it('独立合同覆盖less及more/custom反向状态、恢复、本轮像素身份', () => {
  const fixture = syntheticMedia()
  const assertions = nativeMediaAssertions(nativeMediaContract(fixture.runId), fixture.observation, true, fixture.screenshots, fixture.cssHash)
  expect(assertions.map(item => item.name)).toEqual(expect.arrayContaining(['more/media/more', 'custom/media/custom', 'restored/pixel/identity-current']))
  expect(assertions.every(assertionPassed)).toBe(true)
})

const mutations = {
  '协议返回成功但媒体未变化': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[1]!.queries['less'] = false },
  '媒体正确但候选未变化': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[1]!.backgrounds['probe'] = 'rgb(1, 2, 3)' },
  '条件扩大为布尔prefers-contrast': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[2]!.backgrounds['probe'] = 'rgb(18, 52, 86)' },
  '无条件生效': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[0]!.backgrounds['probe'] = 'rgb(18, 52, 86)' },
  'control污染': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[1]!.backgrounds['control'] = 'rgb(18, 52, 86)' },
  '计算样式正确但PNG错': (f: ReturnType<typeof syntheticMedia>) => { f.screenshots.set(f.observation.states[1]!.screenshot, f.screenshots.get(f.observation.states[0]!.screenshot)!) },
  '缺恢复阶段': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states.pop() },
  '缺PNG': (f: ReturnType<typeof syntheticMedia>) => { f.screenshots.delete(f.observation.states[1]!.screenshot) },
  '旧run的相同阶段PNG': (f: ReturnType<typeof syntheticMedia>) => { f.screenshots = syntheticMedia('old-run').screenshots },
  '旧run身份': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[0]!.runId = 'old-run' },
  '重复状态': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states.push(f.observation.states[0]!) },
  '状态次序错误': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states.reverse() },
  'RAF未递增': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[1]!.frames = [3, 3] },
  '跨阶段RAF倒退': (f: ReturnType<typeof syntheticMedia>) => { f.observation.states[1]!.frames = [0, 1] },
  '恢复协议失败': (f: ReturnType<typeof syntheticMedia>) => { f.observation.cleanup.reset!.error = 'reset failed' },
  'detach失败': (f: ReturnType<typeof syntheticMedia>) => { f.observation.cleanup.detached = false },
}
for (const [name, mutate] of Object.entries(mutations)) {
  it(`拒绝${name}`, () => {
    const fixture = syntheticMedia()
    mutate(fixture)
    let passed = false
    try {
      passed = nativeMediaAssertions(nativeMediaContract(fixture.runId), fixture.observation, true, fixture.screenshots, fixture.cssHash).every(assertionPassed)
    }
    catch {}
    expect(passed).toBe(false)
  })
}

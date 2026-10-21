import { describe, expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { autofillAssertions, autofillContract } from './tailwind-capabilities/web-autofill/contract'
import { syntheticAutofill } from './tailwind-capabilities/web-autofill/test-fixture'

function passed(fixture: ReturnType<typeof syntheticAutofill>) {
  return autofillAssertions(autofillContract(fixture.runId), fixture.observation, true, fixture.screenshots, fixture.cssHash).every(assertionPassed)
}

describe('真实 autofill 的证据合同', () => {
  it('合成证据只验证门禁，可重算三阶段原生状态、独立参考及四边像素', () => {
    expect(passed(syntheticAutofill())).toBe(true)
  })

  it.each([
    ['只有协议成功，没有原生填充事件', (f) => { f.observation.events = [] }],
    ['事件宣称填充，renderer 仍为空', (f) => { f.observation.states[1]!.fields['probe']!.value = '' }],
    ['普通填表有值，但标准伪类未匹配', (f) => { f.observation.states[1]!.fields['probe']!.autofill = false }],
    ['事件来自别的 frame', (f) => { f.observation.events[0]!.filledFields[0]!.frameId = 'stale-frame' }],
    ['事件来自别的 DOM 节点', (f) => { f.observation.events[0]!.filledFields[0]!.fieldId++ }],
    ['未填充对照也被填入', (f) => { f.observation.states[1]!.fields['control']!.value = 'Synthetic' }],
    ['只有颜色没有完整 outline', (f) => { f.observation.states[1]!.fields['probe']!.outline.width = '0px' }],
    ['恢复没有可信键盘编辑', (f) => { f.observation.states[2]!.journal = f.observation.states[1]!.journal }],
    ['恢复状态仍匹配 autofill', (f) => { f.observation.states[2]!.fields['reference']!.autofill = true }],
    ['原生填充事件迟到', (f) => { f.observation.timeline = ['enable', 'state/initial', 'trigger', 'state/filled', 'native-event/0', 'state/restored', 'disable'] }],
    ['同值恢复事件顺序错误', (f) => {
      const journal = f.observation.states[2]!.journal
      const index = f.observation.states[1]!.journal.length
      ;[journal[index], journal[index + 2]] = [journal[index + 2]!, journal[index]!]
    }],
    ['outline style 丢失', (f) => { f.observation.states[1]!.fields['probe']!.outline.style = 'none' }],
    ['outline color 错误', (f) => { f.observation.states[1]!.fields['probe']!.outline.color = 'rgb(86, 52, 18)' }],
    ['旧阶段截图挪用', (f) => { f.screenshots.set('autofill-native-outline-filled.png', f.screenshots.get('autofill-native-outline-initial.png')!) }],
    ['清理失败', (f) => { f.observation.cleanup.detached = false }],
  ] satisfies Array<[string, (fixture: ReturnType<typeof syntheticAutofill>) => void]>)('%s 必须拒绝', (_name, mutate) => {
    const fixture = syntheticAutofill()
    mutate(fixture)
    expect(passed(fixture)).toBe(false)
  })
})

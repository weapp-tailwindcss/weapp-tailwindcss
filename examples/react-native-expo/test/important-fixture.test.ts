import { describe, expect, it } from 'vitest'
import { expectedFixtureStyle, fixtureClassValue, fixtureInlineStyle, nativeFixtures } from '../src/compatibility/protocol'

const phases = ['inline-important', 'inline-normal', 'class-important', 'class-normal']

describe('important 夹具使用普通样式竞争与同值普通 utility 负控', () => {
  it('四个阶段及全部竞争输入进入可哈希的夹具数据', () => {
    expect(nativeFixtures['syntax-important']).toMatchObject({
      phases,
      base: { backgroundColor: '#c026d3' },
      priorityCompetition: {
        normalClassName: 'bg-[#737373]',
        className: 'bg-[#dc2626]',
        inlineStyle: { backgroundColor: '#dc2626' },
      },
    })
  })

  it.each(phases)('%s 使用独立颜色预期和真实竞争 class 输入', (phase) => {
    const expected = { backgroundColor: phase.endsWith('-normal') ? '#dc2626' : '#737373' }
    expect(expectedFixtureStyle('syntax-important', phase)).toEqual(expected)
    const probe = phase.endsWith('-normal') ? 'bg-[#737373]' : '!bg-[#737373]'
    expect(fixtureClassValue('!bg-[#737373]', 'syntax-important', phase)).toEqual(phase.startsWith('class-') ? [probe, 'bg-[#dc2626]'] : probe)
    expect(fixtureInlineStyle('syntax-important', phase)).toEqual(phase.startsWith('inline-') ? { backgroundColor: '#dc2626' } : undefined)
  })
})

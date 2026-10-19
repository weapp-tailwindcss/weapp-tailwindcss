import { describe, expect, it } from 'vitest'
import { scannerGenerationAssertions } from './tailwind-capabilities/authoring-generation'
import { assertionPassed } from './tailwind-capabilities/report'

function check(css: string, reference: string, candidates = ['probe'], absentCandidates: string[] = []) {
  const assertions = scannerGenerationAssertions({ rawCss: css, classSet: new Set(candidates) }, { candidates, absentCandidates }, reference)
  return { assertions, passed: assertions.every(assertionPassed) }
}

describe('真实源码扫描的完整生成证据', () => {
  it('classSet 声称扫描成功但 CSS 缺失不能通过', () => {
    expect(check('', '.probe{width:123px}').passed).toBe(false)
  })

  it('部分声明、后续覆盖和选择器条件丢失不能通过', () => {
    expect(check('.probe{width:123px}', '.probe{width:123px;height:45px}').passed).toBe(false)
    expect(check('.probe{width:123px;width:456px}', '.probe{width:123px}').passed).toBe(false)
    expect(check('.probe{display:flex}', '@media print{.probe{display:flex}}').passed).toBe(false)
  })

  it('变量与关键帧依赖不能由空引用代证', () => {
    const width = '.probe{width:calc(var(--spacing)*4)}'
    expect(check(width, `:root{--spacing:0.25rem}${width}`).passed).toBe(false)
    const animation = '.probe{animation:spin 1s linear infinite}'
    expect(check(animation, `@keyframes spin{to{transform:rotate(360deg)}}${animation}`).passed).toBe(false)
  })

  it('参考必须对每个正向候选产生非空规则', () => {
    expect(check('.probe{width:123px}', '').passed).toBe(false)
    expect(check('.probe{width:123px}', '.probe{width:123px}').passed).toBe(true)
  })

  it('纯负向扫描必须登记排除候选且不能保留其 CSS', () => {
    expect(check('', '', []).passed).toBe(false)
    expect(check('', '', [], ['bg-red-500']).passed).toBe(true)
    expect(check('.bg-red-500{color:red}', '', [], ['bg-red-500']).passed).toBe(false)
  })
})

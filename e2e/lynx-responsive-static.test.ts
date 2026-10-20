import { expect, it } from 'vitest'
import { assertResponsiveGuard } from './lynx/responsive-static'
import { parseGeneratedRules } from './lynx/static-evidence'

const css = '@media (width < 48rem){.max-md\\:w-\\[200px\\]{width:200px}}.probe-responsive-threshold{width:48rem;height:1px}'

it('生成与实际bundle解码保留相同媒体条件和独立标尺', () => {
  for (const stage of ['generation', 'encoding'] as const) {
    expect(() => assertResponsiveGuard(parseGeneratedRules(css), stage)).not.toThrow()
  }
})

it('允许 CSS 入口展开产生的完整相同标尺副本', () => {
  const repeated = `${css}.probe-responsive-threshold{width:48rem;height:1px}`
  for (const stage of ['generation', 'encoding'] as const) {
    expect(() => assertResponsiveGuard(parseGeneratedRules(repeated), stage)).not.toThrow()
  }
})

it.each([
  '.probe-responsive-threshold{width:768px;height:1px}',
  '.probe-responsive-threshold{width:48rem;height:2px}',
  '.probe-responsive-threshold{width:48rem}',
  '.probe-responsive-threshold{width:48rem;height:1px;opacity:1}',
  '@media(width < 48rem){.probe-responsive-threshold{width:48rem;height:1px}}',
  '@supports(display:grid){.probe-responsive-threshold{width:48rem;height:1px}}',
  '.probe-responsive-threshold.extra{width:48rem;height:1px}',
  String.raw`.probe-responsive-thr\65shold{width:48rem;height:1px}`,
])('拒绝错误值、不完整声明、额外条件或复合 selector 的标尺副本 %s', (extra) => {
  for (const stage of ['generation', 'encoding'] as const) {
    expect(() => assertResponsiveGuard(parseGeneratedRules(`${css}${extra}`), stage)).toThrow('响应式')
  }
})

it.each(['removed', 'unconditional', 'wrong-threshold', 'wrong-rule-width', 'duplicate-unconditional', 'missing-marker', 'changed-marker', 'conditional-marker', 'supports-rule', 'supports-marker'] as const)('拒绝 %s 的媒体生成/编码证据', (mode) => {
  let changed = css
  if (mode === 'removed') {
    changed = '.probe-responsive-threshold{width:48rem}'
  }
  if (mode === 'unconditional') {
    changed = '.max-md\\:w-\\[200px\\]{width:200px}.probe-responsive-threshold{width:48rem}'
  }
  if (mode === 'wrong-threshold') {
    changed = changed.replace('(width < 48rem)', '(width < 768px)')
  }
  if (mode === 'wrong-rule-width') {
    changed = changed.replace('width:200px', 'width:80px')
  }
  if (mode === 'duplicate-unconditional') {
    changed += '.max-md\\:w-\\[200px\\]{width:200px}'
  }
  if (mode === 'missing-marker') {
    changed = changed.slice(0, changed.indexOf('.probe-responsive-threshold'))
  }
  if (mode === 'changed-marker') {
    changed = changed.replace('width:48rem', 'width:768px')
  }
  if (mode === 'conditional-marker') {
    changed = `${changed.replace('.probe-responsive-threshold', '@media (width < 48rem){.probe-responsive-threshold')}}`
  }
  if (mode === 'supports-rule') {
    changed = `@supports(display:grid){${changed.replace('.probe-responsive-threshold', '}.probe-responsive-threshold')}`
  }
  if (mode === 'supports-marker') {
    changed = `${changed.replace('.probe-responsive-threshold', '@supports(display:grid){.probe-responsive-threshold')}}`
  }
  for (const stage of ['generation', 'encoding'] as const) {
    expect(() => assertResponsiveGuard(parseGeneratedRules(changed), stage)).toThrow('响应式')
  }
})

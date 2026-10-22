import type { RuleEvidence } from './static-evidence'

const variables = { '--color-brand': '#f00', '--application-brand': '#f00', '--brand-color': '#e65000' }

function isThemeRoot(selector: string, stage: 'generation' | 'encoding') {
  if (selector === ':root') {
    return true
  }
  // 生成产物可保留 Tailwind 原始根组；实际 bundle 必须含 encoder 支持的独立根规则。
  return stage === 'generation' && /^:root\s*,\s*:host$|^:host\s*,\s*:root$/.test(selector)
}

function valueIdentity(value: string | undefined) {
  // 百分号可直接分隔两个 token；仍须完整核对三个分量，不能删除全部空白后猜测。
  const color = /^oklch\(\s*([+-]?(?:\d*\.)?\d+)(%\s*|\s+)([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)\s*\)$/i.exec(value?.trim() ?? '')
  if (color && Number(color[1]) / (color[2]!.includes('%') ? 100 : 1) === 0.63 && Number(color[3]) === 0.2 && Number(color[4]) === 40) {
    return '#e65000'
  }
  const normalized = value?.toLowerCase().replace(/\s+/g, '')
  return ({ '#ff0000': '#f00', 'rgb(255,0,0)': '#f00', '#0000ff': '#00f', 'rgb(0,0,255)': '#00f', 'rgb(230,80,0)': '#e65000' } as Record<string, string>)[normalized ?? ''] ?? normalized
}

/** 变量引用、根定义、主题覆盖与独立字面值对照都必须存在于当前产物。 */
export function assertThemeOverrideRules(rules: RuleEvidence[], stage: 'generation' | 'encoding') {
  const required = [
    ...Object.entries(variables).flatMap(([property, value]) => [
      { selector: ':root', property, value },
      { selector: '.theme-dark', property, value: '#00f' },
    ]),
    { selector: '.bg-brand', property: 'background-color', value: 'var(--color-brand)' },
    { selector: '.theme-variable-application-hex', property: 'background-color', value: 'var(--application-brand)' },
    { selector: '.theme-variable-application-oklch', property: 'background-color', value: 'var(--brand-color)' },
    { selector: '.theme-reference-tailwind-hex', property: 'background-color', value: '#f00' },
    { selector: '.theme-reference-application-hex', property: 'background-color', value: '#f00' },
    { selector: '.theme-reference-application-oklch', property: 'background-color', value: '#e65000' },
    { selector: '.theme-reference-blue', property: 'background-color', value: '#00f' },
    { selector: '.theme-evidence-before .theme-evidence-marker', property: 'width', value: '16px' },
    { selector: '.theme-evidence-after .theme-evidence-marker', property: 'width', value: '24px' },
    { selector: '.theme-evidence-restored .theme-evidence-marker', property: 'width', value: '32px' },
  ]
  for (const expected of required) {
    const declarations = rules.filter(rule => (rule.selector === expected.selector || (expected.selector === ':root' && isThemeRoot(rule.selector, stage))) && !rule.mediaConditions?.length && !rule.supportsConditions?.length)
      .flatMap(rule => rule.declarations.filter(item => item.property === expected.property))
    if (!declarations.length || declarations.some(item => item.important || valueIdentity(item.value) !== valueIdentity(expected.value))) {
      throw new Error(`主题覆盖 ${stage} 缺少或改变独立夹具声明：${expected.selector}/${expected.property}`)
    }
  }
  for (const rule of rules) {
    if (rule.declarations.some(item => item.property in variables) && !isThemeRoot(rule.selector, stage) && rule.selector !== '.theme-dark') {
      throw new Error(`主题覆盖 ${stage} 出现未经声明的局部变量兜底：${rule.selector}`)
    }
  }
}

import type { AuthoringFixture, ExpectedDeclaration } from '@weapp-tailwindcss/test-catalog'
import { authoringFixtures, sourceSyntaxCases } from '@weapp-tailwindcss/test-catalog'

export interface AuthoringWebGroup {
  className: string
  sourceCandidate?: string
  sourceSelector?: string
  declarations: Array<ExpectedDeclaration & { value: string }>
}

export interface AuthoringWebProfile {
  id: string
  fixture: AuthoringFixture
  groups: AuthoringWebGroup[]
  variables: Record<string, string>
  action?: 'ancestor-class' | 'color-scheme'
  competingInline?: string
  reason?: string
}

// 值来自既有夹具的独立预期和显式宿主上下文，不读取生成后的 CSS。
const resolvedVariables: Record<string, Record<string, string>> = {
  'theme': { 'var(--color-catalog-brand)': '#123456' },
  'theme-inline': { 'var(--brand)': '#456789' },
  'reference': { 'var(--color-catalog-brand)': '#123456' },
}

export function authoringWebProfile(fixture: AuthoringFixture): AuthoringWebProfile {
  const base: AuthoringWebProfile = { id: `authoring/${fixture.id}`, fixture, groups: [], variables: {} }
  if (fixture.id === 'theme-inline') {
    base.variables['--brand'] = '#456789'
  }
  if (fixture.id === 'reference') {
    // @reference 不输出共享主题；此夹具只验证消费者的 @apply 与已声明宿主变量。
    base.variables['--color-catalog-brand'] = '#123456'
  }
  for (const expected of fixture.expectedDeclarations) {
    const className = expected.candidate ?? /^\.([a-z][a-z0-9-]*)$/i.exec(expected.selector ?? '')?.[1]
    if (!className || !expected.declarations.length || expected.declarations.some(declaration => declaration.value === undefined)) {
      return { ...base, reason: '夹具尚未声明完整的运行时属性值或可隔离的目标节点；不能用生成存在代替实际语义。' }
    }
    const declarations = expected.declarations.map((declaration) => {
      const value = resolvedVariables[fixture.id]?.[declaration.value!] ?? declaration.value!
      return { ...declaration, value }
    })
    if (declarations.some(declaration => /var\(/.test(declaration.value))) {
      return { ...base, reason: '独立预期仍含未声明宿主值的 CSS 变量，不能把产品与参考同时回落到默认值当作通过。' }
    }
    base.groups.push({ className, sourceCandidate: expected.candidate, sourceSelector: expected.selector, declarations })
  }
  if (!base.groups.length) {
    return { ...base, reason: '扫描语法尚无独立的运行时属性值；本轮仅由严格生成合同验证源码扫描。' }
  }
  if (fixture.id === 'custom-variant') {
    base.action = 'ancestor-class'
  }
  if (fixture.id === 'variant') {
    base.action = 'color-scheme'
  }
  if (fixture.id === 'important') {
    base.competingInline = 'display:block'
  }
  return base
}

export const authoringWebProfiles = [
  ...authoringFixtures,
  ...sourceSyntaxCases.map(item => ({ id: `scan-${item.id}`, css: `@import "tailwindcss" source(none);\n@source "./probe.${item.language}";`, files: { [`probe.${item.language}`]: item.source }, candidates: [], expectedDeclarations: [], absentCandidates: item.absentCandidates })),
].map(authoringWebProfile)

/** HMR 仍需开发服务器、真实源码更新和浏览器事件；本增量不以二次生成补足。 */
export function authoringWebCoverage() {
  return authoringWebProfiles.map(profile => ({ id: profile.id, runtime: profile.reason ? 'not-run' : 'fixture-defined', ...(profile.reason ? { reason: profile.reason } : {}), hmr: 'not-run', hmrReason: '尚未把本夹具接入现有真实 Vite/watch 增删替换与刷新链路；静态重生成不能代证 HMR。' }))
}

import type { AuthoringFixture, ExpectedDeclaration } from '@weapp-tailwindcss/test-catalog'
import { authoringFixtures, sourceSyntaxCases } from '@weapp-tailwindcss/test-catalog'

export interface AuthoringWebGroup {
  className: string
  sourceCandidate?: string
  sourceSelector?: string
  declarations: ExpectedDeclaration[]
  interaction?: 'hover' | 'focus'
  pseudo?: '::after'
  excluded?: boolean
}

export interface AuthoringWebProfile {
  id: string
  fixture: AuthoringFixture
  groups: AuthoringWebGroup[]
  variables: Record<string, string>
  action?: 'ancestor-class' | 'color-scheme'
  competingInline?: string
  baseline?: string
  official?: { candidates: string[], directive?: string, control?: string }
  reason?: string
}

// 逐候选登记语义目标；官方参考只从该名单生成，不读取产品产物推断属性。
const sourceProperties: Record<string, ExpectedDeclaration[]> = {
  'p-4': [{ property: 'padding' }],
  'w-[123px]': [{ property: 'width' }],
  'w-[45px]': [{ property: 'width' }],
  'bg-red-500': [{ property: 'background-color' }],
  'bg-blue-500': [{ property: 'background-color' }],
  'text-red-500': [{ property: 'color' }],
  'opacity-50': [{ property: 'opacity' }],
  'opacity-100': [{ property: 'opacity' }],
  '!bg-[gray]': [{ property: 'background-color' }],
  'after:!content-[\'good_work!\']': [{ property: 'content' }],
  'keep-[business]': [{ property: 'padding' }],
}

function sourceProfile(fixture: AuthoringFixture, candidates: string[]): AuthoringWebProfile {
  const negative = candidates.length === 0
  const selected = negative ? fixture.absentCandidates ?? [] : candidates
  return {
    id: `authoring/${fixture.id}`,
    fixture,
    groups: selected.map(candidate => ({ className: candidate, ...(negative ? { excluded: true } : { sourceCandidate: candidate }), declarations: sourceProperties[candidate] ?? [], ...(candidate.startsWith('after:') ? { pseudo: '::after' as const } : {}) })),
    variables: {},
    baseline: 'opacity:0.37',
    official: { candidates: selected, ...(fixture.id === 'scan-business-text' ? { control: '.keep-\\[business\\]{padding:17px}' } : {}) },
    ...(!selected.length || selected.some(candidate => !sourceProperties[candidate]) ? { reason: '源码语法尚未登记每个候选的独立语义目标，不能从产物反推预期。' } : {}),
  }
}

// 值来自既有夹具的独立预期和显式宿主上下文，不读取生成后的 CSS。
const resolvedVariables: Record<string, Record<string, string>> = {
  'theme': { 'var(--color-catalog-brand)': '#123456' },
  'theme-inline': { 'var(--brand)': '#456789' },
  'reference': { 'var(--color-catalog-brand, #123456)': '#123456' },
}

export function authoringWebProfile(fixture: AuthoringFixture): AuthoringWebProfile {
  const base: AuthoringWebProfile = { id: `authoring/${fixture.id}`, fixture, groups: [], variables: {} }
  if (fixture.id === 'source-inline') {
    const candidates = ['hover:bg-red-500', 'focus:bg-red-600', 'hover:bg-red-600', 'focus:bg-red-500', 'bg-red-500', 'bg-red-600']
    return { ...base, groups: candidates.map(candidate => ({ className: candidate, sourceCandidate: candidate, declarations: [{ property: 'background-color' }], ...(candidate.startsWith('hover:') ? { interaction: 'hover' as const } : candidate.startsWith('focus:') ? { interaction: 'focus' as const } : {}) })), official: { candidates } }
  }
  if (fixture.id === 'source-not-inline') {
    return { ...base, groups: [...fixture.expectedDeclarations.map(expected => ({ className: expected.candidate!, sourceCandidate: expected.candidate, declarations: expected.declarations })), { className: 'p-2', excluded: true, declarations: [{ property: 'padding' }] }], official: { candidates: ['p-1', 'p-3', 'p-2'] } }
  }
  if (fixture.id === 'theme-function') {
    return { ...base, groups: [{ className: 'catalog-theme-function', sourceSelector: '.catalog-theme-function', declarations: fixture.expectedDeclarations[0]!.declarations }], official: { candidates: [], directive: '.catalog-theme-function { padding: --spacing(4); color: --theme(--color-red-500); }' } }
  }
  if (fixture.id === 'theme-inline') {
    base.variables['--brand'] = '#456789'
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
  ...authoringFixtures.map(authoringWebProfile),
  ...sourceSyntaxCases.map(item => sourceProfile({ id: `scan-${item.id}`, css: `@import "tailwindcss" source(none);\n@source "./probe.${item.language}";`, files: { [`probe.${item.language}`]: item.source }, candidates: [], expectedDeclarations: [], absentCandidates: item.absentCandidates }, item.candidates)),
]

/** 此表只登记 authoring 单夹具 HMR；通用 Vite HMR 由独立 runner 记录。 */
export function authoringWebCoverage() {
  return authoringWebProfiles.map(profile => ({ id: profile.id, runtime: profile.reason ? 'not-run' : 'fixture-defined', runtimeScope: profile.fixture.id.startsWith('scan-') ? 'scanned-css-dom-semantics' : 'css-directive-dom-semantics', sourceExecution: profile.fixture.id.startsWith('scan-') ? 'scanner-only-no-jsx-vue-branch-execution' : 'css-directive', ...(profile.reason ? { reason: profile.reason } : {}), hmr: 'not-run', hmrScope: 'authoring-fixture-only', hmrReason: '本指令/扫描语法尚无逐例 HMR；通用候选增删替换、刷新与 WebSocket 证据见独立 Vite HMR 报告。' }))
}

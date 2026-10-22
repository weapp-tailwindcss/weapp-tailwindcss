import type { ReactNativePlatform } from './protocol'

export interface NativeFixtureTarget {
  component: 'view' | 'text' | 'image' | 'scroll'
  style: Record<string, unknown>
  base?: Record<string, unknown>
  children?: boolean
  priorityCompetition?: {
    normalClassName: string
    className: string
    inlineStyle: Record<string, unknown>
  }
}

export interface NativeFixture extends NativeFixtureTarget {
  phases?: readonly string[]
  variants?: Record<string, NativeFixtureTarget>
}

/** 夹具是独立审查的预期，不从本轮 manifest 或历史报告推导支持结论。 */
export const nativeFixtures: Record<string, NativeFixture> = {
  'layout-aspect': { component: 'view', base: { width: 80 }, style: { aspectRatio: 4 / 3 } },
  'layout-overflow': { component: 'view', children: true, style: { overflow: 'hidden' } },
  'layout-position': { component: 'view', style: { position: 'absolute', left: 7, top: 9 } },
  'layout-z-index': { component: 'view', children: true, style: { zIndex: 10 } },
  'flex-direction': { component: 'view', children: true, style: { display: 'flex', flexDirection: 'row' } },
  'flex-alignment': { component: 'view', children: true, style: { alignItems: 'center', justifyContent: 'space-between' } },
  'spacing-margin': { component: 'view', style: { marginTop: -8, marginLeft: 11 } },
  'spacing-padding': { component: 'view', children: true, style: { paddingTop: 13, paddingRight: 7, paddingBottom: 13, paddingLeft: 7 } },
  'spacing-logical': { component: 'view', children: true, style: { paddingHorizontal: 7.5 } },
  'type-size': { component: 'text', style: { fontSize: 23, lineHeight: 28.75 } },
  'type-weight-style': { component: 'text', style: { fontWeight: '700', fontStyle: 'italic' } },
  'type-tracking': { component: 'text', base: { fontSize: 16 }, style: { letterSpacing: 1.92 } },
  'background-color': { component: 'view', style: { backgroundColor: '#123456' } },
  'border-width-color': { component: 'view', style: { borderWidth: 2, borderStyle: 'solid', borderColor: '#16a34a' } },
  'border-radius': { component: 'view', style: { borderRadius: 18 } },
  'syntax-opacity-modifier': { component: 'text', base: { fontSize: 24 }, style: { color: 'rgba(0, 0, 0, 0.35)' } },
  'effect-ring': { component: 'view', style: { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: '#16a34a', inset: true }, { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: '#2563eb' }] } },
  'transform-skew': { component: 'view', style: { transform: [{ skewX: '6deg' }, { skewY: '3deg' }] } },
  'effect-opacity': { component: 'view', style: { opacity: 0.5 } },
  'effect-shadow': { component: 'view', style: { boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: 'rgba(0, 0, 0, 0.1)' }, { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -4, color: 'rgba(0, 0, 0, 0.1)' }] } },
  'variant-dark': { component: 'text', base: { color: '#7c2d12' }, style: { color: '#ffffff' }, phases: ['light', 'dark', 'restored', 'ios', 'android', 'native', 'dark-ios', 'dynamic-array', 'dynamic-object', 'unknown-token', 'inline-normal', 'inline-important'] },
  'syntax-important': {
    component: 'view',
    base: { backgroundColor: '#c026d3' },
    style: { backgroundColor: '#737373' },
    phases: ['inline-important', 'inline-normal', 'class-important', 'class-normal'],
    priorityCompetition: { normalClassName: 'bg-[#737373]', className: 'bg-[#dc2626]', inlineStyle: { backgroundColor: '#dc2626' } },
  },
  'syntax-type-hint': { component: 'text', style: { color: '#c31d6b' } },
  'flex-shorthand-shrink': { component: 'view', children: true, style: { flex: 1, flexShrink: 0 } },
  'grid-align-content-self': { component: 'view', children: true, style: { alignContent: 'center', alignSelf: 'flex-end' } },
  'sizing-size': {
    component: 'view',
    style: { width: 44, height: 44 },
    phases: ['default', 'image', 'scroll-initial', 'scroll-offset', 'scroll-restored'],
    variants: Object.fromEntries(['image', 'scroll-initial', 'scroll-offset', 'scroll-restored'].map(phase => [phase, { component: phase === 'image' ? 'image' : 'scroll', style: { width: 44, height: 44 } }])),
  },
}

export function fixtureForPhase(id: string, phase: string): NativeFixtureTarget | undefined {
  const fixture = nativeFixtures[id]
  return fixture?.variants?.[phase] ?? fixture
}

/** 构建指令的原生编码 oracle 独立于本轮生成器和 manifest。 */
export const nativeBuildFixtures: Record<string, { candidates: string[], style: Record<string, unknown> }> = {
  'directive-import': { candidates: ['flex'], style: { display: 'flex' } },
  'directive-theme': { candidates: ['bg-lynx-brand'], style: { backgroundColor: '#0ea5e9' } },
  'directive-apply': { candidates: ['lynx-applied'], style: { display: 'flex', alignItems: 'center' } },
  'directive-reference': { candidates: ['lynx-reference'], style: { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 } },
  'directive-config-plugin': { candidates: ['p-legacy', 'lynx-plugin-utility'], style: { paddingTop: 19, paddingRight: 19, paddingBottom: 19, paddingLeft: 19, opacity: 0.73 } },
}

export function expectedFixtureStyle(id: string, phase = 'default', platform: ReactNativePlatform = 'ios') {
  const fixture = fixtureForPhase(id, phase)
  if (!fixture) {
    return undefined
  }
  if (fixture.priorityCompetition && phase.endsWith('-normal')) {
    return fixture.priorityCompetition.inlineStyle
  }
  if (id === 'variant-dark') {
    if (['light', 'restored'].includes(phase)) {
      return {}
    }
    if (phase === 'ios' || phase === 'dark-ios') {
      return platform === 'ios' ? { color: '#123456' } : {}
    }
    if (phase === 'android') {
      return platform === 'android' ? { color: '#123456' } : {}
    }
    if (phase === 'native') {
      return platform !== 'web' ? { color: '#123456' } : {}
    }
    if (phase === 'inline-normal') {
      return { color: '#654321' }
    }
    if (phase !== 'dark') {
      return { color: '#123456' }
    }
  }
  return fixture.style
}

export function fixtureClassValue(className: string, id: string, phase: string): string | Array<string | false> | Record<string, boolean> {
  const competition = nativeFixtures[id]?.priorityCompetition
  if (competition) {
    const probe = phase.endsWith('-normal') ? competition.normalClassName : className
    return phase.startsWith('class-') ? [probe, competition.className] : probe
  }
  if (id !== 'variant-dark') {
    return className
  }
  if (phase === 'ios') {
    return 'ios:text-[#123456]'
  }
  if (phase === 'android') {
    return 'android:text-[#123456]'
  }
  if (phase === 'native') {
    return 'native:text-[#123456]'
  }
  if (phase === 'dark-ios') {
    return 'dark:ios:text-[#123456]'
  }
  if (phase === 'dynamic-array') {
    return ['text-[#123456]', false]
  }
  if (phase === 'dynamic-object') {
    return { 'text-[#123456]': true, 'text-[#654321]': false }
  }
  if (phase === 'unknown-token') {
    return ['text-[#123456]', 'rn-unknown-token']
  }
  if (phase === 'inline-normal') {
    return 'text-[#123456]'
  }
  if (phase === 'inline-important') {
    return 'text-[#123456]!'
  }
  return className
}

/** 竞争声明独立于 Tailwind 输出，普通 utility 对照必须保留它的颜色。 */
export function fixtureInlineStyle(id: string, phase: string) {
  if (!phase.startsWith('inline-')) {
    return undefined
  }
  return nativeFixtures[id]?.priorityCompetition?.inlineStyle ?? (id === 'variant-dark' ? { color: '#654321' } : undefined)
}

export function styleContains(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const observed = actual[key]
    if (typeof observed === 'number' && typeof value === 'number') {
      return Math.abs(observed - value) < 0.001
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Boolean(observed && typeof observed === 'object' && styleContains(observed as Record<string, unknown>, value as Record<string, unknown>))
    }
    return JSON.stringify(observed) === JSON.stringify(value)
  })
}

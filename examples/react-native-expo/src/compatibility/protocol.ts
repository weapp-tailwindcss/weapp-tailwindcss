export type ReactNativePlatform = 'android' | 'ios' | 'web'
export type NativeCaseStatus = 'supported' | 'unsupported' | 'unverified' | 'failed'

export interface NativeCheckpoint {
  name: string
  passed: boolean
  actual?: string
  expected?: string
}

export interface NativeDeclarationEvidence {
  property: string
  value?: string
  important?: boolean
}

export interface ReactNativeCaseResult {
  id: string
  status: NativeCaseStatus
  reason?: string
  warnings: string[]
  generated: boolean
  encoded: boolean
  generatedDeclarations: NativeDeclarationEvidence[]
  encodedStyle: Record<string, unknown>
  checkpoints: NativeCheckpoint[]
}

export interface NativeRect { x: number, y: number, width: number, height: number }

export interface NativePairEvidence {
  runId: string
  revision: string
  id: string
  phase: string
  probe: NativeRect
  reference: NativeRect
  target: NativeRect
  referenceTarget: NativeRect
  viewport: { width: number, height: number, pixelRatio: number }
}

export interface NativeCaseReceipt {
  runId: string
  id: string
  phase: string
  checkpoints: NativeCheckpoint[]
  artifact: { name: string, sha256: string, byteLength: number }
}

export interface ReactNativeReport {
  schemaVersion: 2
  stage: 'static' | 'runtime'
  revision: string
  platform: ReactNativePlatform
  catalogHash: string
  fixtureHash: string
  runId: string
  verifiedAt: string
  versions: Record<string, string>
  environment: {
    deviceName: string
    osName: string
    osVersion: string
    runtimeIdentifier: string
    abi: string
    viewport: { width: number, height: number, pixelRatio: number }
    browser?: { name: 'chromium' | 'firefox' | 'webkit', version: string }
  }
  results: ReactNativeCaseResult[]
  receipts: NativeCaseReceipt[]
}

export interface NativeFixture {
  component: 'view' | 'text'
  style: Record<string, unknown>
  base?: Record<string, unknown>
  children?: boolean
  phases?: readonly string[]
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
  'variant-dark': { component: 'text', style: { color: '#ffffff' }, phases: ['light', 'dark', 'restored', 'ios', 'android', 'native', 'dark-ios', 'dynamic-array', 'dynamic-object', 'unknown-token', 'inline-normal', 'inline-important'] },
  'syntax-important': { component: 'view', style: { backgroundColor: '#737373' } },
  'syntax-type-hint': { component: 'text', style: { color: '#c31d6b' } },
  'flex-shorthand-shrink': { component: 'view', children: true, style: { flex: 1, flexShrink: 0 } },
  'grid-align-content-self': { component: 'view', children: true, style: { alignContent: 'center', alignSelf: 'flex-end' } },
  'sizing-size': { component: 'view', style: { width: 44, height: 44 } },
}

export function expectedFixtureStyle(id: string, phase = 'default', platform: ReactNativePlatform = 'ios') {
  const fixture = nativeFixtures[id]
  if (!fixture) {
    return undefined
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

/** 已确认的编码边界；新增能力必须显式调整预期并补真实夹具。 */
export const rejectedNativeCases = new Set([
  'layout-columns',
  'layout-box-sizing',
  'layout-display',
  'layout-float',
  'layout-isolation',
  'layout-object-fit',
  'layout-visibility',
  'flex-grow',
  'grid-template',
  'sizing-fixed',
  'sizing-min-max',
  'table-layout',
  'type-decoration',
  'background-gradient',
  'background-size',
  'effect-blend',
  'filter-blur',
  'filter-backdrop',
  'svg-fill-stroke',
  'transform-translate',
  'transform-rotate',
  'transform-scale',
  'transform-origin',
  'transition-basic',
  'animation-spin',
  'interaction-pointer',
  'interaction-select',
  'interaction-scroll',
  'variant-responsive',
  'variant-state',
  'variant-structural',
  'variant-group-peer',
  'variant-data-aria',
  'variant-supports',
  'variant-pseudo-element',
  'variant-arbitrary',
  'syntax-negative',
  'syntax-arbitrary-property',
  'syntax-css-variable',
  'directive-source',
  'directive-utility',
  'directive-variant',
  'directive-prefix-important',
  'layout-break',
  'layout-decoration-clear',
  'layout-object-position',
  'layout-overscroll',
  'flex-wrap-order',
  'grid-placement',
  'grid-auto',
  'grid-place',
  'grid-justify-self',
  'spacing-space-between',
  'type-family-smoothing-stretch',
  'type-numeric',
  'type-list',
  'type-decoration-full',
  'type-transform-wrap-indent',
  'type-flow',
  'type-breaking',
  'type-content',
  'background-attachment-clip-origin',
  'background-linear-gradient',
  'border-outline',
  'effect-inset-text-shadow',
  'effect-background-blend',
  'effect-mask-box',
  'effect-mask-image-composite',
  'filter-color-adjustments',
  'filter-color-rotation',
  'filter-drop-shadow',
  'filter-backdrop-adjustments',
  'table-spacing-caption',
  'transform-perspective',
  'transform-style-backface',
  'transition-complete',
  'interaction-form-colors',
  'interaction-form-control',
  'interaction-cursor-scheme',
  'interaction-scroll-spacing',
  'interaction-snap-touch',
  'interaction-will-change',
  'accessibility-forced-colors',
  'type-align-overflow',
  'accessibility-sr',
  'type-line-clamp',
  'border-divide',
])

export const nativeBuildCases = new Set(['directive-import', 'directive-theme', 'directive-apply', 'directive-reference', 'directive-config-plugin'])

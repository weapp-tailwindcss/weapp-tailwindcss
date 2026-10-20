import { nativeBuildFixtures } from './fixtures'

export type { NativeFixture } from './fixtures'
export { expectedFixtureStyle, fixtureClassValue, fixtureInlineStyle, nativeBuildFixtures, nativeFixtures, styleContains } from './fixtures'

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
  platform: ReactNativePlatform
  revision: string
  id: string
  phase: string
  probe: NativeRect
  reference: NativeRect
  target: NativeRect
  referenceTarget: NativeRect
  control: NativeRect
  controlTarget: NativeRect
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

export const nativeBuildCases = new Set(Object.keys(nativeBuildFixtures))

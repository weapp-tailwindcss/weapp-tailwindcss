import type { AppUpdateMode } from '../../e2e/hbuilderx-local/hmr-lifecycle.ts'
import type { WatchCase } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types.ts'

export type VisualPlatform = 'h5' | 'weapp' | 'app-android' | 'app-ios' | 'app-harmony'

export interface CaseResult {
  name: string
  platform: VisualPlatform
  styleIsolationVariant?: string
  status: 'passed' | 'failed' | 'skipped'
  updateMode?: AppUpdateMode
  screenshot?: string
  themeLightScreenshot?: string
  themeManualDarkScreenshot?: string
  hmrBeforeScreenshot?: string
  hmrAfterScreenshot?: string
  hmrSteps?: VisualHmrStepResult[]
  hmrDiff?: string
  diff?: string
  comparison?: Record<string, unknown>
  diagnostics?: Record<string, unknown>
  error?: string
}

export interface RuntimeContext {
  artifactRoot: string
  repoRoot: string
  timeoutMs: number
  viewport: {
    width: number
    height: number
  }
  maxCrossPlatformDiffRatio?: number
}

export interface MiniProgramHmrMutation {
  marker: string
  classLiteral: string
  expectedBackgroundColor?: string
  restore: () => Promise<void>
}

export interface VisualHmrStep {
  name: string
  marker: string
  classLiteral: string
  expectedBackgroundColor: string
}

export interface VisualHmrStepResult extends VisualHmrStep {
  beforeScreenshot?: string
  afterScreenshot: string
  diff?: string
  evidence?: Record<string, unknown>
}

export interface MiniProgramHmrVisualConfig {
  label: string
  watchCase: WatchCase
  steps: VisualHmrStep[]
  mutate: (step: VisualHmrStep, previous?: MiniProgramHmrMutation) => Promise<MiniProgramHmrMutation>
}

export interface MiniProgramThemeExpectation {
  manualClass: string
  backgroundColor: [number, number, number]
  scrollContainer?: string
}

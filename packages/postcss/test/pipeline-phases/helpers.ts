import type { IStyleHandlerOptions } from '@/types'

export function options(overrides: Partial<IStyleHandlerOptions> = {}): IStyleHandlerOptions {
  return {
    isMainChunk: false,
    cssInjectPreflight: () => [],
    cssSelectorReplacement: { universal: 'view' },
    cssPreflightRange: 'all',
    cssPreflight: false,
    cssCalc: true,
    rem2rpx: false,
    autoprefixer: false,
    cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true } },
    ...overrides,
  }
}

export function gate() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
